package com.condor.nexussoft.timeclock.geofencing.infrastructure.web;

import com.condor.nexussoft.timeclock.geofencing.domain.port.in.GeofencingUseCase;
import com.condor.nexussoft.timeclock.geofencing.domain.port.out.SitelessAttendancePolicyPort;
import com.condor.nexussoft.timeclock.geofencing.infrastructure.web.dto.GeofencingDtos.QrRequest;
import com.condor.nexussoft.timeclock.geofencing.infrastructure.web.dto.GeofencingDtos.QrResponse;
import com.condor.nexussoft.timeclock.platform.tenant.TenantContext;
import com.condor.nexussoft.timeclock.shared.domain.DomainException;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.UUID;

/**
 * QR de empresa: el cartel que no pertenece a ningún centro y habilita el registro sin validación
 * de geocerca (camino opcional de RF-10/RF-15/HU-10). Vive fuera de {@link GeofencingController}
 * porque aquel cuelga de {@code /work-sites/{workSiteId}} y este, por definición, no tiene centro.
 *
 * <p>Mismo permiso que el QR de centro ({@code geofence:manage}); lo que lo distingue es que exige
 * la política de empresa encendida.</p>
 */
@RestController
@RequestMapping("/api/v1/company")
@PreAuthorize("hasAuthority('geofence:manage')")
public class CompanyQrController {

    private final GeofencingUseCase geofencing;
    private final SitelessAttendancePolicyPort sitelessPolicy;

    public CompanyQrController(GeofencingUseCase geofencing, SitelessAttendancePolicyPort sitelessPolicy) {
        this.geofencing = geofencing;
        this.sitelessPolicy = sitelessPolicy;
    }

    @PostMapping("/qr")
    @ResponseStatus(HttpStatus.CREATED)
    public QrResponse generateCompanyQr(@Valid @RequestBody(required = false) QrRequest r) {
        UUID tenantId = TenantContext.require();
        if (!sitelessPolicy.isEnabled(tenantId)) {
            throw new DomainException("SITELESS_ATTENDANCE_DISABLED",
                    "La empresa no tiene habilitado el registro sin centro de trabajo.");
        }
        Integer ttlMinutes = r != null ? r.ttlMinutes() : null;
        Instant expiresAt = r != null ? r.expiresAt() : null;
        return QrResponse.from(geofencing.generateCompanyQr(tenantId, ttlMinutes, expiresAt));
    }
}
