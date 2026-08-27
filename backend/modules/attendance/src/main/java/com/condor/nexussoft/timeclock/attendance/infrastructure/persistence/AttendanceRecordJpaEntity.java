package com.condor.nexussoft.timeclock.attendance.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Point;

import java.time.Instant;
import java.util.UUID;

/**
 * Entidad del registro de asistencia. La tabla está particionada por {@code server_time}
 * (PK compuesta id+server_time); aquí se mapea {@code id} como clave (el UUID es único),
 * y {@code server_time} como columna — suficiente para inserción y consulta por id.
 */
@Entity
@Table(name = "attendance_records")
public class AttendanceRecordJpaEntity {

    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "server_time", nullable = false)
    private Instant serverTime;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "work_site_id", nullable = false)
    private UUID workSiteId;

    /** Turno al que se atribuye la marca (RN-15); nulo si ninguno la reclama. */
    @Column(name = "shift_id")
    private UUID shiftId;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(nullable = false)
    private String status;

    @Column(name = "rejection_reason")
    private String rejectionReason;

    @Column(nullable = false)
    private Point location;

    @Column(name = "gps_accuracy_m", nullable = false)
    private Double gpsAccuracyM;

    @Column(name = "distance_to_site_m")
    private Double distanceToSiteM;

    @Column(name = "device_id")
    private UUID deviceId;

    @Column(name = "device_time")
    private Instant deviceTime;

    @Column(name = "time_skew_seconds")
    private Integer timeSkewSeconds;

    /** Nonce del QR usado en el registro: traza de auditoría (RN-26), sin unicidad asociada. */
    @Column(name = "qr_nonce")
    private String qrNonce;

    @Column(name = "operation_uuid", nullable = false)
    private UUID operationUuid;

    @Column(nullable = false)
    private String source;

    @Column(name = "biometric_verified", nullable = false)
    private boolean biometricVerified;

    @Column(name = "evidence_bucket")
    private String evidenceBucket;

    @Column(name = "evidence_key")
    private String evidenceKey;

    @Column(name = "evidence_hash")
    private String evidenceHash;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "validations_json", nullable = false)
    private String validationsJson;

    protected AttendanceRecordJpaEntity() {
    }

    // Constructor de creación (todos los campos relevantes).
    public AttendanceRecordJpaEntity(UUID id, UUID tenantId, Instant serverTime, UUID userId, UUID workSiteId,
                                     UUID shiftId,
                                     String eventType, String status, String rejectionReason, Point location,
                                     Double gpsAccuracyM, Double distanceToSiteM, UUID deviceId, Instant deviceTime,
                                     Integer timeSkewSeconds, String qrNonce, UUID operationUuid, String source,
                                     boolean biometricVerified, String evidenceBucket, String evidenceKey,
                                     String evidenceHash, String validationsJson) {
        this.id = id;
        this.tenantId = tenantId;
        this.serverTime = serverTime;
        this.userId = userId;
        this.workSiteId = workSiteId;
        this.shiftId = shiftId;
        this.eventType = eventType;
        this.status = status;
        this.rejectionReason = rejectionReason;
        this.location = location;
        this.gpsAccuracyM = gpsAccuracyM;
        this.distanceToSiteM = distanceToSiteM;
        this.deviceId = deviceId;
        this.deviceTime = deviceTime;
        this.timeSkewSeconds = timeSkewSeconds;
        this.qrNonce = qrNonce;
        this.operationUuid = operationUuid;
        this.source = source;
        this.biometricVerified = biometricVerified;
        this.evidenceBucket = evidenceBucket;
        this.evidenceKey = evidenceKey;
        this.evidenceHash = evidenceHash;
        this.validationsJson = validationsJson;
    }

    public UUID getId() { return id; }
    public UUID getWorkSiteId() { return workSiteId; }
    public UUID getShiftId() { return shiftId; }
    public String getEventType() { return eventType; }
    public String getStatus() { return status; }
    public String getRejectionReason() { return rejectionReason; }
    public Instant getServerTime() { return serverTime; }
    public Point getLocation() { return location; }
}
