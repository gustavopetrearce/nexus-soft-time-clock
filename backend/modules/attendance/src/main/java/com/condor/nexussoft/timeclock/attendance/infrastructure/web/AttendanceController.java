package com.condor.nexussoft.timeclock.attendance.infrastructure.web;

import com.condor.nexussoft.timeclock.attendance.domain.port.in.CancelAttendanceUseCase;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.CancelAttendanceUseCase.CancelledAttendance;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.RegisterAttendanceUseCase;
import com.condor.nexussoft.timeclock.attendance.infrastructure.web.dto.AttendanceResponse;
import com.condor.nexussoft.timeclock.attendance.infrastructure.web.dto.AttendanceSummaryResponse;
import com.condor.nexussoft.timeclock.attendance.infrastructure.web.dto.CancelAttendanceRequest;
import com.condor.nexussoft.timeclock.attendance.infrastructure.web.dto.RegisterAttendanceRequest;
import com.condor.nexussoft.timeclock.platform.tenant.TenantContext;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

/**
 * Registro de asistencia (núcleo, CU-02) e historial propio (RF-05). El registro devuelve
 * 200 con el resultado (ACCEPTED/REJECTED + motivo); un rechazo de negocio no es un error HTTP.
 * El tenant proviene del contexto (JWT) y el usuario del subject del token autenticado.
 */
@RestController
@RequestMapping("/api/v1/attendance")
public class AttendanceController {

    private final RegisterAttendanceUseCase attendance;
    private final CancelAttendanceUseCase cancellation;

    public AttendanceController(RegisterAttendanceUseCase attendance, CancelAttendanceUseCase cancellation) {
        this.attendance = attendance;
        this.cancellation = cancellation;
    }

    @PostMapping
    @PreAuthorize("hasAuthority('attendance:register')")
    public AttendanceResponse register(@Valid @RequestBody RegisterAttendanceRequest request) {
        return AttendanceResponse.from(
                attendance.register(TenantContext.require(), currentUserId(), request.toCommand()));
    }

    /**
     * Historial propio del colaborador (RF-05, HU-16). Filtro opcional por rango de fechas
     * ({@code from}/{@code to} en formato {@code yyyy-MM-dd}; {@code to} inclusivo por día).
     */
    @GetMapping("/me")
    @PreAuthorize("isAuthenticated()")
    public List<AttendanceSummaryResponse> myHistory(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "50") int limit) {

        Instant fromInstant = parseDayStart(from);
        Instant toInstant = parseDayStart(to);
        return attendance.history(TenantContext.require(), currentUserId(), fromInstant, toInstant, limit).stream()
                .map(AttendanceSummaryResponse::from)
                .toList();
    }

    /**
     * Cancela una marca ya registrada (V31): deja de contar como asistencia y cierra sus incidencias
     * abiertas. Definitiva. 404 si no existe en el tenant, 409 si ya no es cancelable.
     */
    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAuthority('attendance:cancel')")
    public CancelledAttendance cancel(@PathVariable UUID id, @Valid @RequestBody CancelAttendanceRequest request) {
        return cancellation.cancel(TenantContext.require(), id, request.serverTime(), request.reason(),
                currentUserId());
    }

    /** Convierte una fecha {@code yyyy-MM-dd} al instante de inicio de día en UTC; nulo/vacío = sin cota. */
    private static Instant parseDayStart(String date) {
        return date == null || date.isBlank()
                ? null
                : LocalDate.parse(date).atStartOfDay().toInstant(ZoneOffset.UTC);
    }

    /** El subject del JWT (nombre de la autenticación) es el id de usuario. */
    private UUID currentUserId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
