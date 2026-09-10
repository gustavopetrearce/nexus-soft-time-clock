package com.condor.nexussoft.timeclock.tenancy.infrastructure.web;

import com.condor.nexussoft.timeclock.platform.tenant.TenantContext;
import com.condor.nexussoft.timeclock.tenancy.domain.CompanySettings;
import com.condor.nexussoft.timeclock.tenancy.domain.port.in.CompanySettingsUseCase;
import com.condor.nexussoft.timeclock.tenancy.infrastructure.web.dto.CompanySettingsDto;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Políticas por defecto de la empresa (HU-13 CA1, HU-14 CA1, RF-28). Los centros de trabajo
 * pueden sobrescribirlas; cuando no lo hacen, rige lo que se configura aquí.
 */
@RestController
@RequestMapping("/api/v1/company/settings")
public class CompanySettingsController {

    private final CompanySettingsUseCase settings;

    public CompanySettingsController(CompanySettingsUseCase settings) {
        this.settings = settings;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('company:settings')")
    public CompanySettingsDto get() {
        return CompanySettingsDto.from(settings.get(TenantContext.require()));
    }

    @PutMapping
    @PreAuthorize("hasAuthority('company:settings')")
    public CompanySettingsDto update(@Valid @RequestBody CompanySettingsDto body) {
        CompanySettings updated = settings.update(TenantContext.require(),
                new CompanySettingsUseCase.UpdateCommand(
                        body.defaultGpsAccuracyMaxM(),
                        body.requirePhoto(),
                        body.requireBiometric(),
                        body.deviceBindingEnabled(),
                        body.deviceBindingAction(),
                        body.sitelessAttendanceEnabled()));
        return CompanySettingsDto.from(updated);
    }
}
