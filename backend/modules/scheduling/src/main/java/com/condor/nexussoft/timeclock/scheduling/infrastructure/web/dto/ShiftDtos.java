package com.condor.nexussoft.timeclock.scheduling.infrastructure.web.dto;

import com.condor.nexussoft.timeclock.scheduling.domain.Shift;
import com.condor.nexussoft.timeclock.scheduling.domain.port.in.SchedulingCommands;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.time.LocalTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** DTOs de turnos. */
public final class ShiftDtos {

    private ShiftDtos() {
    }

    public record ShiftRequest(
            @NotBlank String name,
            @NotNull LocalTime startTime,
            @NotNull LocalTime endTime,
            Boolean crossesMidnight,
            @PositiveOrZero Integer breakMinutes,
            @PositiveOrZero Integer lateToleranceMin,
            @PositiveOrZero Integer earlyToleranceMin,
            @PositiveOrZero Integer windowBeforeMin,
            @PositiveOrZero Integer windowAfterMin,
            /** V38: limitar los descansos a {@code allowedBreakTypeIds}; nulo = no cambiar. */
            Boolean breaksRestricted,
            List<UUID> allowedBreakTypeIds) {

        /** Reglas de descanso pedidas, o {@code null} si el cliente no las envía (se conservan). */
        public SchedulingCommands.BreakRules toBreakRules() {
            if (breaksRestricted == null) {
                return null;
            }
            return new SchedulingCommands.BreakRules(breaksRestricted,
                    allowedBreakTypeIds == null ? Set.of() : new HashSet<>(allowedBreakTypeIds));
        }

        /** Convierte el DTO en el comando de dominio aplicando valores por defecto. */
        public SchedulingCommands.ShiftData toData() {
            return new SchedulingCommands.ShiftData(
                    name, startTime, endTime,
                    Boolean.TRUE.equals(crossesMidnight),
                    breakMinutes == null ? 0 : breakMinutes,
                    lateToleranceMin == null ? 10 : lateToleranceMin,
                    earlyToleranceMin == null ? 10 : earlyToleranceMin,
                    windowBeforeMin == null ? 30 : windowBeforeMin,
                    windowAfterMin == null ? 30 : windowAfterMin);
        }
    }

    public record ShiftResponse(UUID id, UUID scheduleId, String name, LocalTime startTime, LocalTime endTime,
                                boolean crossesMidnight, int breakMinutes, int lateToleranceMin,
                                int earlyToleranceMin, int windowBeforeMin, int windowAfterMin,
                                boolean breaksRestricted, List<UUID> allowedBreakTypeIds) {
        public static ShiftResponse from(Shift s) {
            return new ShiftResponse(s.id(), s.scheduleId(), s.name(), s.startTime(), s.endTime(),
                    s.crossesMidnight(), s.breakMinutes(), s.lateToleranceMin(), s.earlyToleranceMin(),
                    s.windowBeforeMin(), s.windowAfterMin(), s.breaksRestricted(),
                    List.copyOf(s.allowedBreakTypeIds()));
        }
    }
}
