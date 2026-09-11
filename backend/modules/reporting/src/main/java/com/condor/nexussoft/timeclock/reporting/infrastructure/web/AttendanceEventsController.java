package com.condor.nexussoft.timeclock.reporting.infrastructure.web;

import com.condor.nexussoft.timeclock.platform.tenant.TenantContext;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Reporte de registros individuales de asistencia (entradas/salidas/comidas) en un rango.
 * Sirve para analizar a qué hora ficha cada persona. Requiere {@code report:export}.
 * El tenant se obtiene de {@link TenantContext} (igual que ReportController).
 */
@RestController
@RequestMapping("/api/v1/reports")
@PreAuthorize("hasAuthority('report:export')")
public class AttendanceEventsController {

    private final JdbcTemplate jdbc;

    public AttendanceEventsController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Un evento de asistencia crudo con el nombre del colaborador y el sitio.
     *
     * <p>{@code hasEvidence} indica si el registro tiene foto asociada; la URL no viaja aquí porque
     * caduca en un par de minutos, así que el portal la pide bajo demanda al abrir el detalle.
     */
    public record AttendanceEventDto(
            String recordId,
            OffsetDateTime serverTime,
            String userId,
            String employeeName,
            String employeeCode,
            String workSite,
            String eventType,
            String status,
            String rejectionReason,
            boolean hasEvidence,
            boolean biometricVerified,
            Double gpsAccuracyM,
            Double distanceToSiteM,
            String source,
            /**
             * La marca se registró sin centro de trabajo (QR de empresa) y por tanto sin validación
             * de geocerca. Se distingue explícitamente de un centro borrado, que también dejaría
             * {@code workSite} nulo pero sí pasó por su geocerca en su momento.
             */
            boolean siteless) {}

    @GetMapping("/attendance-events")
    public List<AttendanceEventDto> events(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        LocalDate fromD = (from == null || from.isBlank()) ? LocalDate.now().minusDays(29) : LocalDate.parse(from);
        LocalDate toD = (to == null || to.isBlank()) ? LocalDate.now() : LocalDate.parse(to);
        OffsetDateTime fromTs = fromD.atStartOfDay().atOffset(ZoneOffset.UTC);
        OffsetDateTime toTs = toD.plusDays(1).atStartOfDay().atOffset(ZoneOffset.UTC);

        return jdbc.query(
                """
                select ar.id,
                       ar.server_time,
                       ar.user_id,
                       trim(concat(u.first_name, ' ', u.last_name)) as employee_name,
                       u.employee_code,
                       ws.name as work_site,
                       ar.event_type,
                       ar.status,
                       ar.rejection_reason,
                       (ar.evidence_key is not null) as has_evidence,
                       ar.biometric_verified,
                       ar.gps_accuracy_m,
                       ar.distance_to_site_m,
                       ar.source,
                       (ar.work_site_id is null) as siteless
                from attendance_records ar
                join users u on u.id = ar.user_id
                left join work_sites ws on ws.id = ar.work_site_id
                where ar.tenant_id = ?
                  and ar.server_time >= ?
                  and ar.server_time < ?
                order by ar.server_time desc
                """,
                (rs, i) -> {
                    double accuracy = rs.getDouble("gps_accuracy_m");
                    Double accuracyM = rs.wasNull() ? null : accuracy;
                    double distance = rs.getDouble("distance_to_site_m");
                    Double distanceM = rs.wasNull() ? null : distance;
                    return new AttendanceEventDto(
                            rs.getString("id"),
                            rs.getObject("server_time", OffsetDateTime.class),
                            rs.getString("user_id"),
                            rs.getString("employee_name"),
                            rs.getString("employee_code"),
                            rs.getString("work_site"),
                            rs.getString("event_type"),
                            rs.getString("status"),
                            rs.getString("rejection_reason"),
                            rs.getBoolean("has_evidence"),
                            rs.getBoolean("biometric_verified"),
                            accuracyM,
                            distanceM,
                            rs.getString("source"),
                            rs.getBoolean("siteless"));
                },
                TenantContext.require(), fromTs, toTs);
    }
}
