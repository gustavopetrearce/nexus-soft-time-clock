package com.condor.nexussoft.timeclock.identity.infrastructure.persistence;

import com.condor.nexussoft.timeclock.identity.domain.model.ApiClient;
import com.condor.nexussoft.timeclock.identity.domain.port.out.ApiClientRepositoryPort;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class ApiClientPersistenceAdapter implements ApiClientRepositoryPort {

    private final ApiClientJpaRepository jpa;

    public ApiClientPersistenceAdapter(ApiClientJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void save(ApiClient c) {
        jpa.save(new ApiClientJpaEntity(c.id(), c.tenantId(), c.clientId(), c.secretHash(), c.name(),
                c.status().name(), c.lastUsedAt(), c.createdBy(), c.revokedAt(), c.createdAt()));
    }

    @Override
    public void updateLastUsedAt(UUID id, Instant lastUsedAt) {
        jpa.updateLastUsedAt(id, lastUsedAt);
    }

    @Override
    public Optional<ApiClient> findByClientId(String clientId) {
        return jpa.findByClientId(clientId).map(this::toDomain);
    }

    @Override
    public Optional<ApiClient> findByTenantAndId(UUID tenantId, UUID id) {
        return jpa.findByIdAndTenantId(id, tenantId).map(this::toDomain);
    }

    @Override
    public List<ApiClient> findByTenant(UUID tenantId) {
        return jpa.findByTenantIdOrderByCreatedAtDesc(tenantId).stream().map(this::toDomain).toList();
    }

    @Override
    public boolean existsByTenantAndName(UUID tenantId, String name) {
        return jpa.existsByTenantIdAndName(tenantId, name);
    }

    private ApiClient toDomain(ApiClientJpaEntity e) {
        return new ApiClient(e.getId(), e.getTenantId(), e.getClientId(), e.getSecretHash(), e.getName(),
                ApiClient.Status.valueOf(e.getStatus()), e.getLastUsedAt(), e.getCreatedBy(),
                e.getRevokedAt(), e.getCreatedAt());
    }
}
