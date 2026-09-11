package com.condor.nexussoft.timeclock.tenancy.infrastructure.persistence;

import com.condor.nexussoft.timeclock.tenancy.domain.CompanySettings;
import com.condor.nexussoft.timeclock.tenancy.domain.port.out.CompanySettingsRepositoryPort;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public class CompanySettingsPersistenceAdapter implements CompanySettingsRepositoryPort {

    private final CompanySettingsJpaRepository jpa;

    public CompanySettingsPersistenceAdapter(CompanySettingsJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public Optional<CompanySettings> find(UUID tenantId) {
        return jpa.findById(tenantId).map(CompanySettingsPersistenceAdapter::toDomain);
    }

    @Override
    public CompanySettings save(CompanySettings s) {
        // Se actualiza la fila existente en lugar de reemplazarla: así las columnas que esta entidad
        // no mapea (TTLs, políticas antifraude, settings_json) conservan su valor.
        CompanySettingsJpaEntity e = jpa.findById(s.companyId())
                .orElseGet(() -> new CompanySettingsJpaEntity(s.companyId()));
        e.setDefaultGpsAccuracyMaxM(s.defaultGpsAccuracyMaxM());
        e.setRequirePhoto(s.requirePhoto());
        e.setRequireBiometric(s.requireBiometric());
        e.setDeviceBindingEnabled(s.deviceBindingEnabled());
        e.setDeviceBindingAction(s.deviceBindingAction().name());
        e.setSitelessAttendanceEnabled(s.sitelessAttendanceEnabled());
        return toDomain(jpa.save(e));
    }

    private static CompanySettings toDomain(CompanySettingsJpaEntity e) {
        return new CompanySettings(
                e.getCompanyId(),
                e.getDefaultGpsAccuracyMaxM(),
                e.isRequirePhoto(),
                e.isRequireBiometric(),
                e.isDeviceBindingEnabled(),
                CompanySettings.parseAction(e.getDeviceBindingAction()),
                e.isSitelessAttendanceEnabled());
    }
}
