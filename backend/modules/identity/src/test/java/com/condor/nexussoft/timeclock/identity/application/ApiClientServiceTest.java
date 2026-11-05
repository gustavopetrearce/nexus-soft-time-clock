package com.condor.nexussoft.timeclock.identity.application;

import com.condor.nexussoft.timeclock.identity.domain.exception.InvalidClientException;
import com.condor.nexussoft.timeclock.identity.domain.model.ApiClient;
import com.condor.nexussoft.timeclock.identity.domain.port.in.ApiClientUseCase.ApiClientCredentials;
import com.condor.nexussoft.timeclock.identity.domain.port.out.AccessTokenIssuerPort;
import com.condor.nexussoft.timeclock.identity.domain.port.out.ApiClientRepositoryPort;
import com.condor.nexussoft.timeclock.identity.domain.port.out.CompanyDirectoryPort;
import com.condor.nexussoft.timeclock.identity.domain.port.out.DomainEventPublisherPort;
import com.condor.nexussoft.timeclock.identity.domain.port.out.IssuedToken;
import com.condor.nexussoft.timeclock.identity.infrastructure.security.Sha256OpaqueTokenService;
import com.condor.nexussoft.timeclock.shared.domain.ConflictException;
import com.condor.nexussoft.timeclock.shared.domain.ResourceNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ApiClientServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-05T12:00:00Z");

    @Mock
    private ApiClientRepositoryPort clients;
    @Mock
    private CompanyDirectoryPort companies;
    @Mock
    private AccessTokenIssuerPort issuer;
    @Mock
    private DomainEventPublisherPort events;

    private final Sha256OpaqueTokenService opaqueTokens = new Sha256OpaqueTokenService();
    private final UUID tenantId = UUID.randomUUID();
    private ApiClientService service;

    @BeforeEach
    void setUp() {
        service = new ApiClientService(clients, companies, opaqueTokens, issuer, events,
                Clock.fixed(NOW, ZoneOffset.UTC));
        lenient().when(companies.isActiveTenant(tenantId)).thenReturn(true);
    }

    private ApiClient stored(String secret) {
        return ApiClient.create(tenantId, "nxc_abc", opaqueTokens.hash(secret), "ERP", UUID.randomUUID(), NOW);
    }

    @Test
    void crear_devuelveElSecretoYSoloPersisteSuHash() {
        ApiClientCredentials created = service.create(tenantId, "  ERP  ", UUID.randomUUID());

        ArgumentCaptor<ApiClient> saved = ArgumentCaptor.forClass(ApiClient.class);
        verify(clients).save(saved.capture());
        assertThat(saved.getValue().secretHash())
                .isEqualTo(opaqueTokens.hash(created.clientSecret()))
                .isNotEqualTo(created.clientSecret());
        assertThat(saved.getValue().name()).isEqualTo("ERP");
        assertThat(created.client().clientId()).startsWith("nxc_");
        verify(events).publishAll(any());
    }

    @Test
    void crear_conNombreRepetido_esConflicto() {
        when(clients.existsByTenantAndName(tenantId, "ERP")).thenReturn(true);

        assertThatThrownBy(() -> service.create(tenantId, "ERP", UUID.randomUUID()))
                .isInstanceOf(ConflictException.class);
        verify(clients, never()).save(any());
    }

    @Test
    void token_conCredencialValida_emiteYMarcaElUso() {
        ApiClient client = stored("secreto");
        when(clients.findByClientId("nxc_abc")).thenReturn(Optional.of(client));
        when(issuer.issueForClient(client)).thenReturn(new IssuedToken("jwt", 900));

        var token = service.issueToken("nxc_abc", "secreto");

        assertThat(token.value()).isEqualTo("jwt");
        assertThat(token.expiresInSeconds()).isEqualTo(900);
        verify(clients).updateLastUsedAt(client.id(), NOW);
    }

    /** Un reloj se configura una vez: la credencial no puede caducar por antigüedad. */
    @Test
    void credencialDeHaceCincoAnos_sigueAutenticando() {
        Instant fiveYearsAgo = NOW.minus(Duration.ofDays(5 * 365));
        ApiClient client = new ApiClient(UUID.randomUUID(), tenantId, "nxc_abc", opaqueTokens.hash("secreto"), "Reloj",
                ApiClient.Status.ACTIVE, fiveYearsAgo, UUID.randomUUID(), null, fiveYearsAgo);
        when(clients.findByClientId("nxc_abc")).thenReturn(Optional.of(client));

        var authenticated = service.authenticate("nxc_abc", "secreto");

        assertThat(authenticated.id()).isEqualTo(client.id());
        assertThat(authenticated.tenantId()).isEqualTo(tenantId);
        assertThat(authenticated.name()).isEqualTo("Reloj");
    }

    private ApiClient usedAt(Instant lastUsedAt) {
        return new ApiClient(UUID.randomUUID(), tenantId, "nxc_abc", opaqueTokens.hash("secreto"), "Reloj",
                ApiClient.Status.ACTIVE, lastUsedAt, UUID.randomUUID(), null, NOW.minus(Duration.ofDays(1)));
    }

    @Test
    void autenticar_dentroDeCincoMinutos_noEscribeElUltimoUso() {
        ApiClient client = usedAt(NOW.minus(Duration.ofMinutes(5)));
        when(clients.findByClientId("nxc_abc")).thenReturn(Optional.of(client));

        service.authenticate("nxc_abc", "secreto");

        verify(clients, never()).updateLastUsedAt(any(), any());
    }

    @Test
    void autenticar_pasadosCincoMinutos_actualizaSoloElUltimoUso() {
        ApiClient client = usedAt(NOW.minus(Duration.ofMinutes(5)).minusSeconds(1));
        when(clients.findByClientId("nxc_abc")).thenReturn(Optional.of(client));

        service.authenticate("nxc_abc", "secreto");

        verify(clients).updateLastUsedAt(client.id(), NOW);
        // Guardar la entidad entera podría deshacer una revocación concurrente.
        verify(clients, never()).save(any());
    }

    @Test
    void autenticar_conSecretoIncorrecto_seRechazaSinEscribir() {
        when(clients.findByClientId("nxc_abc")).thenReturn(Optional.of(stored("secreto")));

        assertThatThrownBy(() -> service.authenticate("nxc_abc", "otro"))
                .isInstanceOf(InvalidClientException.class);
        verify(clients, never()).updateLastUsedAt(any(), any());
    }

    @Test
    void autenticar_conClienteRevocado_seRechaza() {
        ApiClient client = stored("secreto");
        client.revoke(NOW);
        when(clients.findByClientId("nxc_abc")).thenReturn(Optional.of(client));

        assertThatThrownBy(() -> service.authenticate("nxc_abc", "secreto"))
                .isInstanceOf(InvalidClientException.class);
    }

    @Test
    void autenticar_conEmpresaInactiva_seRechaza() {
        when(clients.findByClientId("nxc_abc")).thenReturn(Optional.of(stored("secreto")));
        when(companies.isActiveTenant(tenantId)).thenReturn(false);

        assertThatThrownBy(() -> service.authenticate("nxc_abc", "secreto"))
                .isInstanceOf(InvalidClientException.class);
    }

    @Test
    void token_conSecretoIncorrecto_seRechaza() {
        when(clients.findByClientId("nxc_abc")).thenReturn(Optional.of(stored("secreto")));

        assertThatThrownBy(() -> service.issueToken("nxc_abc", "otro"))
                .isInstanceOf(InvalidClientException.class);
        verify(issuer, never()).issueForClient(any());
    }

    @Test
    void token_conClienteInexistente_daElMismoError() {
        when(clients.findByClientId("nxc_nada")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.issueToken("nxc_nada", "secreto"))
                .isInstanceOf(InvalidClientException.class);
    }

    @Test
    void token_conClienteRevocado_seRechaza() {
        ApiClient client = stored("secreto");
        client.revoke(NOW);
        when(clients.findByClientId("nxc_abc")).thenReturn(Optional.of(client));

        assertThatThrownBy(() -> service.issueToken("nxc_abc", "secreto"))
                .isInstanceOf(InvalidClientException.class);
    }

    @Test
    void token_conEmpresaInactiva_seRechaza() {
        when(clients.findByClientId("nxc_abc")).thenReturn(Optional.of(stored("secreto")));
        when(companies.isActiveTenant(tenantId)).thenReturn(false);

        assertThatThrownBy(() -> service.issueToken("nxc_abc", "secreto"))
                .isInstanceOf(InvalidClientException.class);
    }

    @Test
    void rotar_invalidaElSecretoAnterior() {
        ApiClient client = stored("viejo");
        when(clients.findByTenantAndId(tenantId, client.id())).thenReturn(Optional.of(client));

        ApiClientCredentials rotated = service.rotateSecret(tenantId, client.id());

        assertThat(client.secretHash()).isEqualTo(opaqueTokens.hash(rotated.clientSecret()));
        assertThat(rotated.clientSecret()).isNotEqualTo("viejo");
    }

    @Test
    void rotar_unaCredencialRevocada_esConflicto() {
        ApiClient client = stored("viejo");
        client.revoke(NOW);
        when(clients.findByTenantAndId(tenantId, client.id())).thenReturn(Optional.of(client));

        assertThatThrownBy(() -> service.rotateSecret(tenantId, client.id()))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void revocar_esIdempotenteYConservaLaPrimeraFecha() {
        ApiClient client = stored("secreto");
        Instant first = NOW.minusSeconds(3600);
        client.revoke(first);
        when(clients.findByTenantAndId(tenantId, client.id())).thenReturn(Optional.of(client));

        service.revoke(tenantId, client.id());

        assertThat(client.revokedAt()).isEqualTo(first);
        verify(clients, never()).save(any());
        verify(events, never()).publishAll(any());
    }

    @Test
    void administrar_unaCredencialDeOtraEmpresa_noLaEncuentra() {
        UUID ajena = UUID.randomUUID();
        when(clients.findByTenantAndId(tenantId, ajena)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.revoke(tenantId, ajena))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void isActive_refleja_revocacionYEmpresa() {
        ApiClient client = stored("secreto");
        when(clients.findByTenantAndId(tenantId, client.id())).thenReturn(Optional.of(client));

        assertThat(service.isActive(tenantId, client.id())).isTrue();

        client.revoke(NOW);
        assertThat(service.isActive(tenantId, client.id())).isFalse();
    }
}
