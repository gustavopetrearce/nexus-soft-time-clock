package com.condor.nexussoft.timeclock.tenancy.application;

import com.condor.nexussoft.timeclock.tenancy.domain.CompanySettings;
import com.condor.nexussoft.timeclock.tenancy.domain.port.in.CompanySettingsUseCase;
import com.condor.nexussoft.timeclock.tenancy.domain.port.out.CompanySettingsRepositoryPort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/** Gestiona las políticas por defecto del tenant. Las validaciones viven en {@link CompanySettings}. */
@Service
public class CompanySettingsService implements CompanySettingsUseCase {

    private final CompanySettingsRepositoryPort repository;

    public CompanySettingsService(CompanySettingsRepositoryPort repository) {
        this.repository = repository;
    }

    @Override
    @Transactional(readOnly = true)
    public CompanySettings get(UUID tenantId) {
        // Un tenant sin fila de configuración opera con los valores por defecto del esquema (V1/V20),
        // así que se devuelven esos mismos en vez de un 404 que el portal no sabría interpretar.
        return repository.find(tenantId).orElseGet(() -> defaultsFor(tenantId));
    }

    @Override
    @Transactional
    public CompanySettings update(UUID tenantId, UpdateCommand c) {
        return repository.save(new CompanySettings(
                tenantId,
                c.defaultGpsAccuracyMaxM(),
                c.requirePhoto(),
                c.requireBiometric(),
                c.deviceBindingEnabled(),
                CompanySettings.parseAction(c.deviceBindingAction()),
                c.sitelessAttendanceEnabled()));
    }

    private CompanySettings defaultsFor(UUID tenantId) {
        return new CompanySettings(tenantId, 50, false, false, true,
                CompanySettings.DeviceBindingAction.REJECT, false);
    }
}
