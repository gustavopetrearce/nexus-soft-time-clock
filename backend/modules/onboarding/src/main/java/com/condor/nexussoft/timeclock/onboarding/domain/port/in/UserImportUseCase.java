package com.condor.nexussoft.timeclock.onboarding.domain.port.in;

import com.condor.nexussoft.timeclock.identity.domain.port.in.GranterAuthority;
import com.condor.nexussoft.timeclock.onboarding.domain.ImportReport;
import com.condor.nexussoft.timeclock.onboarding.domain.ImportRow;

import java.util.List;
import java.util.UUID;

/** Importación masiva de colaboradores al tenant del operador (todo o nada). */
public interface UserImportUseCase {

    /**
     * Valida el archivo completo y, si no hay errores y {@code dryRun} es false, crea usuarios,
     * perfiles y turnos en una sola transacción.
     */
    ImportReport importUsers(UUID tenantId, Requester requester, List<ImportRow> rows, boolean dryRun);

    /**
     * Quién importa.
     *
     * @param granter         potestad de delegación de roles (RoleGrantPolicy)
     * @param canAssignShifts ¿tiene {@code schedule:manage}? Sin él, las columnas de turno son error
     */
    record Requester(GranterAuthority granter, boolean canAssignShifts) {
    }
}
