package com.condor.nexussoft.timeclock.attendance.domain;

import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * Valida la coherencia de la secuencia de eventos de una jornada (RN-12):
 * <ul>
 *   <li>SALIDA/descanso/cambio de sitio requieren una ENTRADA abierta (HU-11 CA1).</li>
 *   <li>No se admiten dos INICIO_DESCANSO seguidos ni un FIN_DESCANSO sin descanso abierto (HU-12 CA2).</li>
 *   <li>La jornada transcurre en un mismo centro: SALIDA y descansos deben registrarse donde está
 *       abierta. CAMBIO_SITIO es el <b>único</b> evento que mueve ese centro de referencia; sin él,
 *       un descanso terminado en otro centro arrastraría la jornada entera y permitiría cerrarla allí.</li>
 * </ul>
 * El estado se deriva del <b>último evento aceptado</b> del usuario dentro de la ventana de jornada
 * abierta ({@code company_settings.open_shift_max_hours}); los rechazados no alteran la jornada.
 */
public final class AttendanceSequenceValidator {

    private AttendanceSequenceValidator() {
    }

    /** Último evento aceptado del usuario (estado de la jornada); vacío si nunca registró o ya cerró. */
    public record LastEvent(AttendanceEventType type, UUID workSiteId) {
    }

    /**
     * @return el motivo {@link RejectionReason#INVALID_SEQUENCE} si la transición es incoherente,
     * o vacío si la secuencia es válida.
     */
    public static Optional<RejectionReason> validate(Optional<LastEvent> last,
                                                     AttendanceEventType requested, UUID requestedSite) {
        AttendanceEventType prev = last.map(LastEvent::type).orElse(null);
        boolean ok = switch (requested) {
            // Solo se puede entrar si no hay jornada abierta (sin evento previo o tras una SALIDA).
            case ENTRADA -> prev == null || prev == AttendanceEventType.SALIDA;
            // Solo se puede salir si hay jornada abierta y en el mismo centro donde está abierta.
            case SALIDA -> isWorking(prev) && sameSite(last, requestedSite);
            // Iniciar descanso exige estar trabajando (no en descanso) y en el centro de la jornada.
            case INICIO_DESCANSO -> isWorking(prev) && sameSite(last, requestedSite);
            // Terminar descanso exige un descanso abierto, en el centro donde se inició.
            case FIN_DESCANSO ->
                    prev == AttendanceEventType.INICIO_DESCANSO && sameSite(last, requestedSite);
            // Cambiar de sitio exige estar trabajando; es el evento que traslada la jornada.
            case CAMBIO_SITIO -> isWorking(prev);
        };
        return ok ? Optional.empty() : Optional.of(RejectionReason.INVALID_SEQUENCE);
    }

    /** Estados en los que la jornada está abierta y el colaborador no está en descanso. */
    private static boolean isWorking(AttendanceEventType prev) {
        return prev == AttendanceEventType.ENTRADA
                || prev == AttendanceEventType.FIN_DESCANSO
                || prev == AttendanceEventType.CAMBIO_SITIO;
    }

    /**
     * Compara con {@code Objects.equals} porque el centro puede ser nulo en ambos lados: una
     * jornada abierta sin centro (QR de empresa) casa consigo misma, y una abierta en un centro
     * no se puede cerrar sin él —ni al revés—, que es justo lo que debe ocurrir.
     */
    private static boolean sameSite(Optional<LastEvent> last, UUID requestedSite) {
        return last.map(l -> Objects.equals(l.workSiteId(), requestedSite)).orElse(false);
    }
}
