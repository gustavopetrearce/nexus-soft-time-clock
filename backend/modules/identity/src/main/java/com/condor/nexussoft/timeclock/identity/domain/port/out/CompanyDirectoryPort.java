package com.condor.nexussoft.timeclock.identity.domain.port.out;

import java.util.Optional;
import java.util.UUID;

/**
 * Puerto de resolución de tenant en el login. Provisional en identity hasta que el
 * bounded context Tenancy (BC-02) exponga su propio servicio; entonces este puerto
 * se implementará contra él en lugar de leer la tabla companies directamente.
 */
public interface CompanyDirectoryPort {

    /** Resuelve el tenant activo por código de empresa o dominio de email. */
    Optional<UUID> resolveActiveTenant(String companyCodeOrEmailDomain);

    boolean isActiveTenant(UUID tenantId);
}
