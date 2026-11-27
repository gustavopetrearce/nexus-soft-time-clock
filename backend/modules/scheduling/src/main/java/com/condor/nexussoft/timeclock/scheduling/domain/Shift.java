package com.condor.nexussoft.timeclock.scheduling.domain;

import java.time.LocalTime;
import java.util.Set;
import java.util.UUID;

/** Turno (RF-08): definición horaria con tolerancias y ventana de registro (RN-15, RN-16). */
public class Shift {

    private final UUID id;
    private final UUID tenantId;
    private final UUID scheduleId;
    private String name;
    private LocalTime startTime;
    private LocalTime endTime;
    private boolean crossesMidnight;
    private int breakMinutes;
    private int lateToleranceMin;
    private int earlyToleranceMin;
    private int windowBeforeMin;
    private int windowAfterMin;
    /** V38: si el turno limita las categorías de descanso a {@link #allowedBreakTypeIds}. */
    private boolean breaksRestricted;
    private Set<UUID> allowedBreakTypeIds = Set.of();

    public Shift(UUID id, UUID tenantId, UUID scheduleId, String name, LocalTime startTime, LocalTime endTime,
                 boolean crossesMidnight, int breakMinutes, int lateToleranceMin, int earlyToleranceMin,
                 int windowBeforeMin, int windowAfterMin) {
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

    public static Shift create(UUID tenantId, UUID scheduleId, String name, LocalTime startTime, LocalTime endTime,
                               boolean crossesMidnight, int breakMinutes, int lateToleranceMin,
                               int earlyToleranceMin, int windowBeforeMin, int windowAfterMin) {
        return new Shift(UUID.randomUUID(), tenantId, scheduleId, name, startTime, endTime, crossesMidnight,
                breakMinutes, lateToleranceMin, earlyToleranceMin, windowBeforeMin, windowAfterMin);
    }

    public void update(String name, LocalTime startTime, LocalTime endTime, boolean crossesMidnight,
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

    /**
     * Reglas de descanso del turno (V38). Restringido y sin categorías = turno sin descansos; sin
     * restringir, admite todas (y la lista se descarta).
     */
    public void setBreakRules(boolean restricted, Set<UUID> breakTypeIds) {
        this.breaksRestricted = restricted;
        this.allowedBreakTypeIds = restricted && breakTypeIds != null ? Set.copyOf(breakTypeIds) : Set.of();
    }

    public boolean breaksRestricted() { return breaksRestricted; }
    public Set<UUID> allowedBreakTypeIds() { return allowedBreakTypeIds; }

    public UUID id() { return id; }
    public UUID tenantId() { return tenantId; }
    public UUID scheduleId() { return scheduleId; }
    public String name() { return name; }
    public LocalTime startTime() { return startTime; }
    public LocalTime endTime() { return endTime; }
    public boolean crossesMidnight() { return crossesMidnight; }
    public int breakMinutes() { return breakMinutes; }
    public int lateToleranceMin() { return lateToleranceMin; }
    public int earlyToleranceMin() { return earlyToleranceMin; }
    public int windowBeforeMin() { return windowBeforeMin; }
    public int windowAfterMin() { return windowAfterMin; }
}
