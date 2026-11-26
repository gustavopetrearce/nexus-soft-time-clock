package com.condor.nexussoft.timeclock.onboarding.domain.port.out;

import com.condor.nexussoft.timeclock.onboarding.domain.ShiftRef;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Lecturas que necesita la validación del archivo, resueltas en pocas consultas para todo el lote.
 * Son lecturas entre módulos (users, roles, schedules, work_sites), mismo precedente que los
 * adaptadores de directorio de Scheduling y HR; las <b>escrituras</b> pasan siempre por los casos
 * de uso de cada contexto.
 */
public interface ImportCatalogPort {

    /** De los correos dados (ya normalizados), los que ya usa algún usuario del tenant. */
    Set<String> existingEmails(UUID tenantId, Collection<String> emails);

    /** De los números de empleado dados, los que ya usa algún usuario del tenant. */
    Set<String> existingEmployeeCodes(UUID tenantId, Collection<String> employeeCodes);

    /** Códigos de los roles plantilla del sistema ({@code tenant_id IS NULL}). */
    Set<String> systemRoleCodes();

    /** Roles plantilla que incluyen el permiso dado. */
    Set<String> rolesWithPermission(String permission);

    /** Turnos de los horarios activos del tenant. */
    List<ShiftRef> shifts(UUID tenantId);

    /** Centros de trabajo activos del tenant, por código. */
    Map<String, UUID> activeWorkSites(UUID tenantId);
}
