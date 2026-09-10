package com.condor.nexussoft.timeclock.tenancy.domain.port.in;

import com.condor.nexussoft.timeclock.tenancy.domain.CompanySettings;

import java.util.UUID;

/** Consulta y edición de las políticas por defecto de la empresa (HU-13, HU-14, RF-28). */
public interface CompanySettingsUseCase {

    CompanySettings get(UUID tenantId);

    CompanySettings update(UUID tenantId, UpdateCommand command);

    record UpdateCommand(Integer defaultGpsAccuracyMaxM, boolean requirePhoto, boolean requireBiometric,
                         boolean deviceBindingEnabled, String deviceBindingAction,
                         boolean sitelessAttendanceEnabled) {
    }
}
