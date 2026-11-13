package com.condor.nexussoft.timeclock.attendance.domain.port.out;

import com.condor.nexussoft.timeclock.attendance.domain.BreakType;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Persistencia de las categorías de descanso por empresa. */
public interface BreakTypePort {

    /** Todas las categorías del tenant (habilitadas o no), en su orden de presentación. */
    List<BreakType> findByTenant(UUID tenantId);

    Optional<BreakType> findById(UUID tenantId, UUID id);

    boolean existsCode(UUID tenantId, String code, UUID excludingId);

    BreakType save(BreakType breakType);

    /** Si alguna marca ya usa la categoría: entonces solo puede desactivarse, no borrarse. */
    boolean isInUse(UUID tenantId, UUID id);

    void delete(UUID tenantId, UUID id);
}
