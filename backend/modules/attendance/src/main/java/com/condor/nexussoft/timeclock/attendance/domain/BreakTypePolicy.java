package com.condor.nexussoft.timeclock.attendance.domain;

import com.condor.nexussoft.timeclock.attendance.domain.AttendanceSequenceValidator.LastEvent;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Decide la categoría de descanso de una marca:
 * <ul>
 *   <li>{@code INICIO_DESCANSO} la elige. Si la empresa tiene categorías habilitadas, es obligatoria
 *       y debe ser una de ellas; sin categorías, se registra el descanso genérico de siempre.</li>
 *   <li>{@code FIN_DESCANSO} la <b>hereda</b> del descanso abierto: lo que declare el cliente se
 *       ignora, para que inicio y fin no puedan discrepar.</li>
 *   <li>El resto de eventos no lleva categoría.</li>
 * </ul>
 */
public final class BreakTypePolicy {

    private BreakTypePolicy() {
    }

    /** Categoría a persistir, o el motivo de rechazo si la petición no es válida. */
    public record Resolution(UUID breakTypeId, RejectionReason rejection) {
        static Resolution of(UUID id) {
            return new Resolution(id, null);
        }

        static Resolution rejected() {
            return new Resolution(null, RejectionReason.INVALID_BREAK_TYPE);
        }
    }

    /**
     * @param required si una categoría habilitada es obligatoria al iniciar descanso. La API externa
     *                 la deja opcional: el sistema emisor puede no conocer las categorías.
     */
    public static Resolution resolve(AttendanceEventType eventType, UUID requested,
                                     List<BreakType> tenantTypes, Optional<LastEvent> last, boolean required) {
        return switch (eventType) {
            case INICIO_DESCANSO -> resolveStart(requested, tenantTypes, required);
            case FIN_DESCANSO -> Resolution.of(last.map(LastEvent::breakTypeId).orElse(null));
            default -> Resolution.of(null);
        };
    }

    private static Resolution resolveStart(UUID requested, List<BreakType> tenantTypes, boolean required) {
        if (requested == null) {
            boolean anyEnabled = tenantTypes.stream().anyMatch(BreakType::enabled);
            return required && anyEnabled ? Resolution.rejected() : Resolution.of(null);
        }
        boolean valid = tenantTypes.stream().anyMatch(t -> t.enabled() && t.id().equals(requested));
        return valid ? Resolution.of(requested) : Resolution.rejected();
    }
}
