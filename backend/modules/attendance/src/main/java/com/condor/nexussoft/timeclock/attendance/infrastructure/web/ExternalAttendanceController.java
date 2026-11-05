package com.condor.nexussoft.timeclock.attendance.infrastructure.web;

import com.condor.nexussoft.timeclock.attendance.domain.port.in.RegisterExternalAttendanceUseCase;
import com.condor.nexussoft.timeclock.attendance.infrastructure.web.dto.AttendanceResponse;
import com.condor.nexussoft.timeclock.attendance.infrastructure.web.dto.RegisterExternalAttendanceRequest;
import com.condor.nexussoft.timeclock.platform.tenant.TenantContext;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Marcación desde sistemas externos (ADR-013). Como en el registro normal, un rechazo de negocio es
 * 200 con el motivo. El tenant sale del token, nunca de la petición (RN-31), y el {@code sub} de un
 * token de sistema es el id de la credencial.
 */
@RestController
@RequestMapping("/api/v1/integrations/attendance")
public class ExternalAttendanceController {

    private final RegisterExternalAttendanceUseCase attendance;

    public ExternalAttendanceController(RegisterExternalAttendanceUseCase attendance) {
        this.attendance = attendance;
    }

    @PostMapping
    @PreAuthorize("hasAuthority('attendance:register:external')")
    public AttendanceResponse register(@Valid @RequestBody RegisterExternalAttendanceRequest request) {
        UUID apiClientId = UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
        return AttendanceResponse.from(
                attendance.register(TenantContext.require(), apiClientId, request.toCommand()));
    }
}
