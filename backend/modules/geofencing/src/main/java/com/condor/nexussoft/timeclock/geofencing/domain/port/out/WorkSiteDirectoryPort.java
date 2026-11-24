package com.condor.nexussoft.timeclock.geofencing.domain.port.out;

import java.util.UUID;

/** ¿El centro de trabajo pertenece al tenant? Evita geocercas o QR sobre centros de otra empresa. */
public interface WorkSiteDirectoryPort {

    boolean belongsToTenant(UUID tenantId, UUID workSiteId);
}
