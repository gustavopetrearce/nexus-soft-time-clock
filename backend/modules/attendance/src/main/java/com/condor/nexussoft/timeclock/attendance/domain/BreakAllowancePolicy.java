package com.condor.nexussoft.timeclock.attendance.domain;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Límites de descanso (V38), aplicados al iniciar un descanso con categoría:
 * <ul>
 *   <li><b>Por turno</b>: un turno con {@code breaks_restricted} solo admite sus categorías
 *       ({@code shift_break_types}); sin ninguna, no admite descansos (p. ej. nocturno). Manda el
 *       turno de la ENTRADA que abrió la jornada; sin turno no hay restricción.</li>
 *   <li><b>Uso único por día</b>: cada categoría se usa una vez por día, contando todas las
 *       jornadas que empiezan en la misma fecha local que la actual.</li>
 * </ul>
 * El descanso genérico (empresa sin categorías) no tiene límite: no hay nada que distinguir.
 * El orden entre categorías no se fuerza; la secuencia de la jornada sigue siendo la de siempre.
 */
public final class BreakAllowancePolicy {

    private BreakAllowancePolicy() {
    }

    /**
     * Lo que la jornada actual admite.
     *
     * @param restricted si el turno limita las categorías a {@code allowed}
     * @param usedToday  categorías ya usadas (descanso iniciado y aceptado) en el día de la jornada
     */
    public record Allowance(boolean restricted, Set<UUID> allowed, Set<UUID> usedToday) {
        public Allowance {
            allowed = allowed == null ? Set.of() : Set.copyOf(allowed);
            usedToday = usedToday == null ? Set.of() : Set.copyOf(usedToday);
        }

        public static Allowance unrestricted() {
            return new Allowance(false, Set.of(), Set.of());
        }
    }

    /** Disponibilidad de una categoría para la jornada actual. */
    public enum Availability { AVAILABLE, NOT_ALLOWED_FOR_SHIFT, ALREADY_USED }

    public static Availability availability(UUID breakTypeId, Allowance allowance) {
        if (breakTypeId == null) {
            return Availability.AVAILABLE;
        }
        if (allowance.restricted() && !allowance.allowed().contains(breakTypeId)) {
            return Availability.NOT_ALLOWED_FOR_SHIFT;
        }
        if (allowance.usedToday().contains(breakTypeId)) {
            return Availability.ALREADY_USED;
        }
        return Availability.AVAILABLE;
    }

    /** Motivo de rechazo de un INICIO_DESCANSO con esa categoría, si no está disponible. */
    public static Optional<RejectionReason> check(UUID breakTypeId, Allowance allowance) {
        return switch (availability(breakTypeId, allowance)) {
            case AVAILABLE -> Optional.empty();
            case NOT_ALLOWED_FOR_SHIFT -> Optional.of(RejectionReason.BREAK_NOT_ALLOWED_FOR_SHIFT);
            case ALREADY_USED -> Optional.of(RejectionReason.BREAK_ALREADY_USED);
        };
    }
}
