package com.condor.nexussoft.timeclock.reporting.application;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Consulta las filas del reporte de asistencia con filtros (rango, estado). */
@Service
public class AttendanceReportService {

    private static final int MAX_ROWS = 5000;

    private final JdbcTemplate jdbc;

    public AttendanceReportService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ReportRow> rows(UUID tenantId, Instant from, Instant to, String status) {
        StringBuilder sql = new StringBuilder(
                "SELECT server_time, user_id, event_type, status, rejection_reason, cancel_reason, "
                        + "ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng "
                        + "FROM attendance_records WHERE tenant_id = ? AND server_time BETWEEN ? AND ?");
        List<Object> args = new ArrayList<>();
        args.add(tenantId);
        args.add(Timestamp.from(from));
        args.add(Timestamp.from(to));
        if (status != null && !status.isBlank()) {
            sql.append(" AND status = ?");
            args.add(status);
        }
        sql.append(" ORDER BY server_time DESC LIMIT ").append(MAX_ROWS);

        return jdbc.query(sql.toString(), (rs, i) -> new ReportRow(
                rs.getTimestamp("server_time").toInstant(),
                rs.getObject("user_id", UUID.class),
                rs.getString("event_type"),
                rs.getString("status"),
                rs.getString("rejection_reason"),
                // getObject y no getDouble: este devuelve 0 con NULL y la marca sin GPS saldría en 0,0.
                rs.getObject("lat", Double.class),
                rs.getObject("lng", Double.class),
                rs.getString("cancel_reason")), args.toArray());
    }

    /**
     * Registros individuales por empleado (una fila por marcación) con nombre + número de empleado
     * y nombre del centro de trabajo, sin exponer ids/llaves. Une {@code attendance_records} con
     * {@code users} y {@code work_sites}; filtra por rango y estado opcional, más reciente primero.
     */
    public List<AttendanceRecordRow> records(UUID tenantId, Instant from, Instant to, String status) {
        StringBuilder sql = new StringBuilder(
                "SELECT ar.server_time, u.employee_code, u.first_name, u.last_name, "
                        + "ar.event_type, ar.status, ar.rejection_reason, ws.name AS work_center, "
                        + "bt.label AS break_type, ar.cancel_reason "
                        + "FROM attendance_records ar "
                        + "JOIN users u ON u.id = ar.user_id "
                        + "LEFT JOIN work_sites ws ON ws.id = ar.work_site_id "
                        + "LEFT JOIN attendance_break_types bt "
                        + "ON bt.id = ar.break_type_id AND bt.tenant_id = ar.tenant_id "
                        + "WHERE ar.tenant_id = ? AND ar.server_time BETWEEN ? AND ?");
        List<Object> args = new ArrayList<>();
        args.add(tenantId);
        args.add(Timestamp.from(from));
        args.add(Timestamp.from(to));
        if (status != null && !status.isBlank()) {
            sql.append(" AND ar.status = ?");
            args.add(status);
        }
        sql.append(" ORDER BY ar.server_time DESC LIMIT ").append(MAX_ROWS);

        return jdbc.query(sql.toString(), (rs, i) -> {
            String code = rs.getString("employee_code");
            String name = (rs.getString("first_name") + " " + rs.getString("last_name")).trim();
            String workCenter = rs.getString("work_center");
            return new AttendanceRecordRow(
                    code != null ? code : "—",
                    name,
                    rs.getTimestamp("server_time").toInstant(),
                    rs.getString("event_type"),
                    rs.getString("status"),
                    rs.getString("rejection_reason"),
                    workCenter != null ? workCenter : "—",
                    rs.getString("break_type"),
                    rs.getString("cancel_reason"));
        }, args.toArray());
    }
}
