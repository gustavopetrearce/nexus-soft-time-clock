package com.condor.nexussoft.timeclock.identity.application;

import com.condor.nexussoft.timeclock.identity.domain.event.ApiClientCreated;
import com.condor.nexussoft.timeclock.identity.domain.event.ApiClientRevoked;
import com.condor.nexussoft.timeclock.identity.domain.event.ApiClientSecretRotated;
import com.condor.nexussoft.timeclock.identity.domain.exception.InvalidClientException;
import com.condor.nexussoft.timeclock.identity.domain.model.ApiClient;
import com.condor.nexussoft.timeclock.identity.domain.port.in.ApiClientUseCase;
import com.condor.nexussoft.timeclock.identity.domain.port.out.AccessTokenIssuerPort;
import com.condor.nexussoft.timeclock.identity.domain.port.out.ApiClientRepositoryPort;
import com.condor.nexussoft.timeclock.identity.domain.port.out.CompanyDirectoryPort;
import com.condor.nexussoft.timeclock.identity.domain.port.out.DomainEventPublisherPort;
import com.condor.nexussoft.timeclock.identity.domain.port.out.IssuedToken;
import com.condor.nexussoft.timeclock.identity.domain.port.out.OpaqueTokenServicePort;
import com.condor.nexussoft.timeclock.shared.domain.ConflictException;
import com.condor.nexussoft.timeclock.shared.domain.DomainEvent;
import com.condor.nexussoft.timeclock.shared.domain.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Credenciales de sistemas externos (ADR-013). El secreto se trata como un refresh token: 256 bits
 * aleatorios de los que solo se guarda el SHA-256. Con esa entropía un hash lento no aporta nada y
 * tampoco hace falta contador de intentos, porque adivinarlo es inviable.
 */
@Service
public class ApiClientService implements ApiClientUseCase {

    private static final String CLIENT_ID_PREFIX = "nxc_";

    /** Precisión de last_used_at: un reloj que descarga un lote no debe escribir una vez por marca. */
    private static final Duration LAST_USED_RESOLUTION = Duration.ofMinutes(5);

    private final ApiClientRepositoryPort clients;
    private final CompanyDirectoryPort companies;
    private final OpaqueTokenServicePort opaqueTokens;
    private final AccessTokenIssuerPort accessTokenIssuer;
    private final DomainEventPublisherPort eventPublisher;
    private final Clock clock;

    public ApiClientService(ApiClientRepositoryPort clients, CompanyDirectoryPort companies,
                            OpaqueTokenServicePort opaqueTokens, AccessTokenIssuerPort accessTokenIssuer,
                            DomainEventPublisherPort eventPublisher, Clock clock) {
        this.clients = clients;
        this.companies = companies;
        this.opaqueTokens = opaqueTokens;
        this.accessTokenIssuer = accessTokenIssuer;
        this.eventPublisher = eventPublisher;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ApiClientView> list(UUID tenantId) {
        return clients.findByTenant(tenantId).stream().map(ApiClientService::toView).toList();
    }

    @Override
    @Transactional
    public ApiClientCredentials create(UUID tenantId, String name, UUID createdBy) {
        String cleanName = name.trim();
        if (clients.existsByTenantAndName(tenantId, cleanName)) {
            throw new ConflictException("API_CLIENT_NAME_TAKEN", "Ya existe una credencial con ese nombre.");
        }
        Instant now = clock.instant();
        String secret = opaqueTokens.generate();
        ApiClient client = ApiClient.create(tenantId, CLIENT_ID_PREFIX + opaqueTokens.generate(),
                opaqueTokens.hash(secret), cleanName, createdBy, now);
        clients.save(client);
        publish(ApiClientCreated.of(tenantId, client.id(), client.clientId(), client.name(), now));
        return new ApiClientCredentials(toView(client), secret);
    }

    @Override
    @Transactional
    public ApiClientCredentials rotateSecret(UUID tenantId, UUID id) {
        ApiClient client = get(tenantId, id);
        if (!client.isActive()) {
            throw new ConflictException("API_CLIENT_REVOKED", "La credencial está revocada.");
        }
        String secret = opaqueTokens.generate();
        client.rotateSecret(opaqueTokens.hash(secret));
        clients.save(client);
        publish(ApiClientSecretRotated.of(tenantId, client.id(), client.clientId(), client.name(), clock.instant()));
        return new ApiClientCredentials(toView(client), secret);
    }

    @Override
    @Transactional
    public void revoke(UUID tenantId, UUID id) {
        ApiClient client = get(tenantId, id);
        if (!client.isActive()) {
            return;  // idempotente: conserva la fecha de la primera revocación
        }
        Instant now = clock.instant();
        client.revoke(now);
        clients.save(client);
        publish(ApiClientRevoked.of(tenantId, client.id(), client.clientId(), client.name(), now));
    }

    @Override
    @Transactional
    public ClientAccessToken issueToken(String clientId, String clientSecret) {
        IssuedToken token = accessTokenIssuer.issueForClient(validate(clientId, clientSecret));
        return new ClientAccessToken(token.value(), token.expiresInSeconds());
    }

    @Override
    @Transactional
    public AuthenticatedClient authenticate(String clientId, String clientSecret) {
        ApiClient client = validate(clientId, clientSecret);
        return new AuthenticatedClient(client.id(), client.tenantId(), client.clientId(), client.name());
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isActive(UUID tenantId, UUID id) {
        return clients.findByTenantAndId(tenantId, id).filter(ApiClient::isActive).isPresent()
                && companies.isActiveTenant(tenantId);
    }

    /** La credencial no tiene vencimiento: solo deja de valer al revocarla, rotarla o inactivar la empresa. */
    private ApiClient validate(String clientId, String clientSecret) {
        ApiClient client = clients.findByClientId(clientId).orElseThrow(InvalidClientException::new);
        if (!secretMatches(clientSecret, client.secretHash())
                || !client.isActive()
                || !companies.isActiveTenant(client.tenantId())) {
            throw new InvalidClientException();
        }
        Instant now = clock.instant();
        if (client.lastUsedAt() == null || client.lastUsedAt().isBefore(now.minus(LAST_USED_RESOLUTION))) {
            clients.updateLastUsedAt(client.id(), now);
        }
        return client;
    }

    private ApiClient get(UUID tenantId, UUID id) {
        return clients.findByTenantAndId(tenantId, id)
                .orElseThrow(() -> new ResourceNotFoundException("Credencial", id));
    }

    /** Comparación en tiempo constante, para que el tiempo de respuesta no filtre el hash. */
    private boolean secretMatches(String rawSecret, String storedHash) {
        return MessageDigest.isEqual(
                opaqueTokens.hash(rawSecret).getBytes(StandardCharsets.UTF_8),
                storedHash.getBytes(StandardCharsets.UTF_8));
    }

    private void publish(DomainEvent event) {
        eventPublisher.publishAll(List.of(event));
    }

    private static ApiClientView toView(ApiClient c) {
        return new ApiClientView(c.id(), c.clientId(), c.name(), c.status().name(),
                c.lastUsedAt(), c.revokedAt(), c.createdAt());
    }
}
