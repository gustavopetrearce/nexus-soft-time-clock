package com.condor.nexussoft.timeclock.scheduling.domain.port.in;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;
import java.util.UUID;

public final class SchedulingCommands {

    private SchedulingCommands() {
    }

    public record CreateScheduleCommand(String code, String name, String timezone) {
    }

    public record UpdateScheduleCommand(String name, String timezone, String status) {
    }

    /**
     * Reglas de descanso de un turno (V38): {@code restricted} limita las categorías a
     * {@code breakTypeIds}; sin ninguna, el turno no admite descansos.
     */
    public record BreakRules(boolean restricted, Set<UUID> breakTypeIds) {
    }

    public record ShiftData(String name, LocalTime startTime, LocalTime endTime, boolean crossesMidnight,
                            int breakMinutes, int lateToleranceMin, int earlyToleranceMin,
                            int windowBeforeMin, int windowAfterMin) {
    }

    public record AssignShiftCommand(UUID userId, UUID shiftId, UUID workSiteId,
                                     LocalDate validFrom, LocalDate validTo) {
    }
}
