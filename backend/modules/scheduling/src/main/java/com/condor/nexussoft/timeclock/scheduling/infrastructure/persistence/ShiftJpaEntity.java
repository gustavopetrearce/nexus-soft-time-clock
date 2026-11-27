package com.condor.nexussoft.timeclock.scheduling.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "shifts")
public class ShiftJpaEntity {

    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "schedule_id", nullable = false)
    private UUID scheduleId;

    @Column(nullable = false)
    private String name;

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    @Column(name = "crosses_midnight", nullable = false)
    private boolean crossesMidnight;

    @Column(name = "break_minutes", nullable = false)
    private int breakMinutes;

    @Column(name = "late_tolerance_min", nullable = false)
    private int lateToleranceMin;

    @Column(name = "early_tolerance_min", nullable = false)
    private int earlyToleranceMin;

    @Column(name = "window_before_min", nullable = false)
    private int windowBeforeMin;

    @Column(name = "window_after_min", nullable = false)
    private int windowAfterMin;

    @Column(name = "breaks_restricted", nullable = false)
    private boolean breaksRestricted;

    protected ShiftJpaEntity() {
    }

    public ShiftJpaEntity(UUID id, UUID tenantId, UUID scheduleId, String name, LocalTime startTime,
                          LocalTime endTime, boolean crossesMidnight, int breakMinutes, int lateToleranceMin,
                          int earlyToleranceMin, int windowBeforeMin, int windowAfterMin) {
        this.id = id;
        this.tenantId = tenantId;
        this.scheduleId = scheduleId;
        this.name = name;
        this.startTime = startTime;
        this.endTime = endTime;
        this.crossesMidnight = crossesMidnight;
        this.breakMinutes = breakMinutes;
        this.lateToleranceMin = lateToleranceMin;
        this.earlyToleranceMin = earlyToleranceMin;
        this.windowBeforeMin = windowBeforeMin;
        this.windowAfterMin = windowAfterMin;
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public UUID getScheduleId() { return scheduleId; }
    public String getName() { return name; }
    public LocalTime getStartTime() { return startTime; }
    public LocalTime getEndTime() { return endTime; }
    public boolean isCrossesMidnight() { return crossesMidnight; }
    public int getBreakMinutes() { return breakMinutes; }
    public int getLateToleranceMin() { return lateToleranceMin; }
    public int getEarlyToleranceMin() { return earlyToleranceMin; }
    public int getWindowBeforeMin() { return windowBeforeMin; }
    public int getWindowAfterMin() { return windowAfterMin; }
    public boolean isBreaksRestricted() { return breaksRestricted; }
    public void setBreaksRestricted(boolean breaksRestricted) { this.breaksRestricted = breaksRestricted; }

    public void apply(String name, LocalTime startTime, LocalTime endTime, boolean crossesMidnight,
                      int breakMinutes, int lateToleranceMin, int earlyToleranceMin,
                      int windowBeforeMin, int windowAfterMin) {
        this.name = name;
        this.startTime = startTime;
        this.endTime = endTime;
        this.crossesMidnight = crossesMidnight;
        this.breakMinutes = breakMinutes;
        this.lateToleranceMin = lateToleranceMin;
        this.earlyToleranceMin = earlyToleranceMin;
        this.windowBeforeMin = windowBeforeMin;
        this.windowAfterMin = windowAfterMin;
    }
}
