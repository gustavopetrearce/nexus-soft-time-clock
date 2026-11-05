package com.condor.nexussoft.timeclock.identity.domain.port.out;

import com.condor.nexussoft.timeclock.identity.domain.model.ApiClient;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Puerto de salida hacia la persistencia de credenciales de sistema. */
public interface ApiClientRepositoryPort {

    void save(ApiClient client);

    /**
     * Actualiza solo la fecha de último uso. Guardar la entidad entera podría pisar una revocación
     * o una rotación ocurrida entre la lectura y la escritura, y reactivar la credencial.
     */
    void updateLastUsedAt(UUID id, Instant lastUsedAt);

    Optional<ApiClient> findByClientId(String clientId);

    Optional<ApiClient> findByTenantAndId(UUID tenantId, UUID id);

    List<ApiClient> findByTenant(UUID tenantId);

    boolean existsByTenantAndName(UUID tenantId, String name);
}
