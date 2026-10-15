package com.condor.nexussoft.timeclock.tenancy.domain.port.out;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * Cuenta los colaboradores activos de un tenant, tal como los define RN-35: cuentas
 * <b>habilitadas para registrar accesos</b> cuyo estado no sea una baja.
 */
public interface ActiveCollaboratorCounterPort {

    long countActiveCollaborators(UUID tenantId);

    /**
     * Lo mismo para varios tenants en una sola consulta. El listado de empresas del portal
     * necesita el consumo de toda la página; pedirlo uno por uno sería un N+1 por pantalla.
     * Los tenants sin colaboradores pueden no aparecer en el mapa.
     */
    Map<UUID, Long> countActiveCollaboratorsByTenant(Collection<UUID> tenantIds);
}
