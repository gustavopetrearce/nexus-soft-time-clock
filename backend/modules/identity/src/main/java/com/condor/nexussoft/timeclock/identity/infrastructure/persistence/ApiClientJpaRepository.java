package com.condor.nexussoft.timeclock.identity.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ApiClientJpaRepository extends JpaRepository<ApiClientJpaEntity, UUID> {

    Optional<ApiClientJpaEntity> findByClientId(String clientId);

    Optional<ApiClientJpaEntity> findByIdAndTenantId(UUID id, UUID tenantId);

    List<ApiClientJpaEntity> findByTenantIdOrderByCreatedAtDesc(UUID tenantId);

    boolean existsByTenantIdAndName(UUID tenantId, String name);

    @Modifying
    @Query("update ApiClientJpaEntity c set c.lastUsedAt = :lastUsedAt where c.id = :id")
    void updateLastUsedAt(@Param("id") UUID id, @Param("lastUsedAt") Instant lastUsedAt);
}
