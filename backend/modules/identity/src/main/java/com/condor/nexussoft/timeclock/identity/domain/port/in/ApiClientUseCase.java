package com.condor.nexussoft.timeclock.identity.domain.port.in;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Credenciales de sistemas externos (ADR-013): su administración por la empresa y el canje de
 * {@code client_id}/{@code client_secret} por un access token.
 */
public interface ApiClientUseCase {

    /** Proyección de lectura. No lleva el secreto ni su hash. */
    record ApiClientView(UUID id, String clientId, String name, String status,
                         Instant lastUsedAt, Instant revokedAt, Instant createdAt) {}

    /** Credencial con el secreto en claro: es la única vez que sale del servidor. */
    record ApiClientCredentials(ApiClientView client, String clientSecret) {}

    /** Access token del cliente. No hay refresh: al caducar se pide otro con la credencial. */
    record ClientAccessToken(String value, long expiresInSeconds) {}

    /** Identidad de un cliente cuya credencial ya se comprobó. */
    record AuthenticatedClient(UUID id, UUID tenantId, String clientId, String name) {}

    List<ApiClientView> list(UUID tenantId);

    ApiClientCredentials create(UUID tenantId, String name, UUID createdBy);

    /** Reemplaza el secreto al instante, sin solapamiento con el anterior. */
    ApiClientCredentials rotateSecret(UUID tenantId, UUID id);

    void revoke(UUID tenantId, UUID id);

    /** @throws com.condor.nexussoft.timeclock.identity.domain.exception.InvalidClientException si la credencial no sirve. */
    ClientAccessToken issueToken(String clientId, String clientSecret);

    /**
     * Comprueba la credencial sin emitir token, para los dispositivos que la envían en cada petición.
     *
     * @throws com.condor.nexussoft.timeclock.identity.domain.exception.InvalidClientException si la credencial no sirve.
     */
    AuthenticatedClient authenticate(String clientId, String clientSecret);

    /**
     * Si el cliente puede operar ahora mismo. El JWT sigue siendo válido hasta caducar, así que el
     * endpoint de marcación pregunta aquí para que una revocación surta efecto de inmediato.
     */
    boolean isActive(UUID tenantId, UUID id);
}
