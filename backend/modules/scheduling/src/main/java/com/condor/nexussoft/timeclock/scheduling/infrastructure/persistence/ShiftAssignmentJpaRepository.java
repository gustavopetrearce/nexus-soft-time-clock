package com.condor.nexussoft.timeclock.scheduling.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ShiftAssignmentJpaRepository extends JpaRepository<ShiftAssignmentJpaEntity, UUID> {

    /**
     * Orden explícito: sin él Postgres devuelve las filas en el orden que le conviene y la respuesta
     * de {@code GET /api/v1/shift-assignments} varía entre llamadas. La vigencia más reciente primero.
     */
    List<ShiftAssignmentJpaEntity> findByUserIdAndTenantIdOrderByValidFromDescIdAsc(UUID userId, UUID tenantId);
}
