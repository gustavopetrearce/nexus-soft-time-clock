package com.condor.nexussoft.timeclock.attendance.infrastructure.persistence;

import com.condor.nexussoft.timeclock.attendance.domain.AttendanceEventType;
import com.condor.nexussoft.timeclock.attendance.domain.AttendanceRecord;
import com.condor.nexussoft.timeclock.attendance.domain.AttendanceRecordRef;
import com.condor.nexussoft.timeclock.attendance.domain.AttendanceSequenceValidator.LastEvent;
import com.condor.nexussoft.timeclock.attendance.domain.AttendanceStatus;
import com.condor.nexussoft.timeclock.attendance.domain.Evidence;
import com.condor.nexussoft.timeclock.attendance.domain.GpsFix;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.AttendanceSummary;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.AttendanceRepositoryPort;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class AttendancePersistenceAdapter implements AttendanceRepositoryPort {

    private final AttendanceRecordJpaRepository jpa;
    private final NamedParameterJdbcTemplate jdbc;

    public AttendancePersistenceAdapter(AttendanceRecordJpaRepository jpa, NamedParameterJdbcTemplate jdbc) {
        this.jpa = jpa;
        this.jdbc = jdbc;
    }

    @Override
    public void save(AttendanceRecord r) {
        Evidence e = r.evidence();
        GpsFix gps = r.gps();
        jpa.save(new AttendanceRecordJpaEntity(
                r.id(), r.tenantId(), r.serverTime(), r.userId(), r.workSiteId(), r.shiftId(),
                r.eventType().name(), r.status().name(),
                r.rejectionReason() == null ? null : r.rejectionReason().name(),
                gps == null ? null : GeoSupport.point(gps.latitude(), gps.longitude()),
                gps == null ? null : gps.accuracyM(), r.distanceToSiteM(),
                null,                       // device_id (uuid) — no resuelto en esta iteración
                r.deviceTime(), r.timeSkewSeconds(), r.qrNonce(), r.operationUuid(), r.source(),
                r.biometricVerified(),
                e == null ? null : e.bucket(), e == null ? null : e.key(), e == null ? null : e.hash(),
                r.validationsJson(), r.breakTypeId()));
    }

    @Override
    public Optional<LastEvent> findLastAcceptedEvent(UUID tenantId, UUID userId, Instant since) {
        // La cota por server_time acota la jornada (RN-12) y además permite podar particiones.
        return jpa.findFirstByTenantIdAndUserIdAndStatusAndServerTimeGreaterThanEqualOrderByServerTimeDesc(
                        tenantId, userId, AttendanceStatus.ACCEPTED.name(), since)
                .map(e -> new LastEvent(AttendanceEventType.valueOf(e.getEventType()), e.getWorkSiteId(),
                        e.getBreakTypeId()));
    }

    @Override
    public Optional<LastEvent> findLastAcceptedEventBefore(UUID tenantId, UUID userId, Instant since, Instant before) {
        return jpa.findFirstByTenantIdAndUserIdAndStatusAndServerTimeGreaterThanEqualAndServerTimeLessThanOrderByServerTimeDesc(
                        tenantId, userId, AttendanceStatus.ACCEPTED.name(), since, before)
                .map(e -> new LastEvent(AttendanceEventType.valueOf(e.getEventType()), e.getWorkSiteId(),
                        e.getBreakTypeId()));
    }

    @Override
    public boolean existsAcceptedEventSince(UUID tenantId, UUID userId, Instant since) {
        return jpa.existsByTenantIdAndUserIdAndStatusAndServerTimeGreaterThanEqual(
                tenantId, userId, AttendanceStatus.ACCEPTED.name(), since);
    }

    /**
     * Historial del colaborador con el <b>nombre</b> del centro de trabajo (join a {@code work_sites}),
     * sin exponer ids ni coordenadas (HU-16). Filtra por rango de fechas opcional sobre {@code server_time}
     * (clave de partición), más reciente primero.
     */
    @Override
    public List<AttendanceSummary> findRecentByUser(
            UUID tenantId, UUID userId, Instant from, Instant toExclusive, int limit) {

        StringBuilder sql = new StringBuilder(
                "SELECT ar.event_type, ar.status, ar.rejection_reason, ar.server_time, ws.name AS work_center, "
                        + "ar.cancel_reason "
                        + "FROM attendance_records ar "
                        + "LEFT JOIN work_sites ws ON ws.id = ar.work_site_id "
                        + "WHERE ar.tenant_id = :tenant AND ar.user_id = :user");
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("tenant", tenantId)
                .addValue("user", userId)
                .addValue("limit", limit);
        if (from != null) {
            sql.append(" AND ar.server_time >= :from");
            params.addValue("from", Timestamp.from(from));
        }
        if (toExclusive != null) {
            sql.append(" AND ar.server_time < :toExcl");
            params.addValue("toExcl", Timestamp.from(toExclusive));
        }
        sql.append(" ORDER BY ar.server_time DESC LIMIT :limit");

        return jdbc.query(sql.toString(), params, (rs, i) -> new AttendanceSummary(
                rs.getString("event_type"),
                rs.getString("status"),
                rs.getString("rejection_reason"),
                rs.getTimestamp("server_time").toInstant(),
                rs.getString("work_center"),
                rs.getString("cancel_reason")));
    }

    @Override
    public Optional<AttendanceRecordRef> findRef(UUID tenantId, UUID id, Instant serverTime) {
        StringBuilder sql = new StringBuilder(
                "SELECT id, tenant_id, server_time, user_id, event_type, status FROM attendance_records "
                        + "WHERE tenant_id = :tenant AND id = :id");
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("tenant", tenantId)
                .addValue("id", id);
        if (serverTime != null) {
            sql.append(" AND server_time = :serverTime");
            params.addValue("serverTime", Timestamp.from(serverTime));
        }
        return jdbc.query(sql.toString(), params, (rs, i) -> new AttendanceRecordRef(
                        rs.getObject("id", UUID.class),
                        rs.getObject("tenant_id", UUID.class),
                        rs.getTimestamp("server_time").toInstant(),
                        rs.getObject("user_id", UUID.class),
                        AttendanceEventType.valueOf(rs.getString("event_type")),
                        AttendanceStatus.valueOf(rs.getString("status"))))
                .stream().findFirst();
    }

    @Override
    public boolean markCancelled(UUID tenantId, UUID id, Instant serverTime, String reason, UUID cancelledBy,
                                 Instant cancelledAt) {
        // server_time en el WHERE: la tabla está particionada por esa columna (PK id+server_time).
        int updated = jdbc.update(
                "UPDATE attendance_records SET status = 'CANCELLED', cancel_reason = :reason, "
                        + "cancelled_by = :by, cancelled_at = :at "
                        + "WHERE tenant_id = :tenant AND id = :id AND server_time = :serverTime "
                        + "AND status IN ('ACCEPTED', 'PENDING_REVIEW')",
                new MapSqlParameterSource()
                        .addValue("reason", reason)
                        .addValue("by", cancelledBy)
                        .addValue("at", Timestamp.from(cancelledAt))
                        .addValue("tenant", tenantId)
                        .addValue("id", id)
                        .addValue("serverTime", Timestamp.from(serverTime)));
        return updated > 0;
    }
}
