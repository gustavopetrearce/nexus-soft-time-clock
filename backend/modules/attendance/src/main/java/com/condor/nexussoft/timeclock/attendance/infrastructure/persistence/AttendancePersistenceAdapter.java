package com.condor.nexussoft.timeclock.attendance.infrastructure.persistence;

import com.condor.nexussoft.timeclock.attendance.domain.AttendanceEventType;
import com.condor.nexussoft.timeclock.attendance.domain.AttendanceRecord;
import com.condor.nexussoft.timeclock.attendance.domain.AttendanceSequenceValidator.LastEvent;
import com.condor.nexussoft.timeclock.attendance.domain.AttendanceStatus;
import com.condor.nexussoft.timeclock.attendance.domain.Evidence;
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
        jpa.save(new AttendanceRecordJpaEntity(
                r.id(), r.tenantId(), r.serverTime(), r.userId(), r.workSiteId(), r.shiftId(),
                r.eventType().name(), r.status().name(),
                r.rejectionReason() == null ? null : r.rejectionReason().name(),
                GeoSupport.point(r.gps().latitude(), r.gps().longitude()),
                r.gps().accuracyM(), r.distanceToSiteM(),
                null,                       // device_id (uuid) — no resuelto en esta iteración
                r.deviceTime(), r.timeSkewSeconds(), r.qrNonce(), r.operationUuid(), r.source(),
                r.biometricVerified(),
                e == null ? null : e.bucket(), e == null ? null : e.key(), e == null ? null : e.hash(),
                r.validationsJson()));
    }

    @Override
    public Optional<LastEvent> findLastAcceptedEvent(UUID tenantId, UUID userId, Instant since) {
        // La cota por server_time acota la jornada (RN-12) y además permite podar particiones.
        return jpa.findFirstByTenantIdAndUserIdAndStatusAndServerTimeGreaterThanEqualOrderByServerTimeDesc(
                        tenantId, userId, AttendanceStatus.ACCEPTED.name(), since)
                .map(e -> new LastEvent(AttendanceEventType.valueOf(e.getEventType()), e.getWorkSiteId()));
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
                "SELECT ar.event_type, ar.status, ar.rejection_reason, ar.server_time, ws.name AS work_center "
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
                rs.getString("work_center")));
    }
}
