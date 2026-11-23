package com.condor.nexussoft.timeclock.scheduling.domain.port.out;

import java.util.UUID;

/** Pertenencia de usuarios y centros al tenant: no se asignan turnos con datos de otra empresa. */
public interface TenantDirectoryPort {

    boolean isTenantUser(UUID tenantId, UUID userId);

    boolean isTenantWorkSite(UUID tenantId, UUID workSiteId);
}
