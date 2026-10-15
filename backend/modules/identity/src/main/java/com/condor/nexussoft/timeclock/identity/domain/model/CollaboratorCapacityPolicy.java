package com.condor.nexussoft.timeclock.identity.domain.model;

import java.util.Set;

/**
 * Decide cuándo una operación sobre un usuario <b>consume</b> cupo de colaboradores activos
 * (RN-34, RN-35). Política pura, sin dependencias: las tres puertas que pueden habilitar a un
 * colaborador —alta, reactivación y cambio de roles— preguntan aquí.
 *
 * <p>Un colaborador cuenta cuando se cumplen las dos cosas a la vez: está <b>habilitado para
 * registrar accesos</b> (su rol incluye {@code attendance:register}) y su cuenta no es una baja.
 * {@code LOCKED} e {@code INVITED} cuentan: el bloqueo por intentos fallidos (RN-40) es
 * transitorio y al expirar el tenant quedaría por encima del límite sin que nadie lo autorice, y
 * un invitado es un asiento ya asignado. Solo {@code INACTIVE} libera.
 */
public final class CollaboratorCapacityPolicy {

    private static final Set<String> ESTADOS_QUE_CONSUMEN = Set.of("ACTIVE", "INVITED", "LOCKED");

    private CollaboratorCapacityPolicy() {
    }

    public static boolean consumesCapacity(String status) {
        return status != null && ESTADOS_QUE_CONSUMEN.contains(status);
    }

    /**
     * ¿Hace falta cupo libre para aplicar el cambio? Solo cuando el usuario <b>no</b> contaba
     * antes y sí cuenta después; reactivar a quien ya estaba bloqueado, o quitarle un rol, no
     * consume nada.
     *
     * @param currentStatus   estado antes del cambio; {@code null} en un alta.
     * @param registersNow    si sus roles actuales permiten registrar asistencia.
     * @param targetStatus    estado después del cambio.
     * @param registersAfter  si sus roles tras el cambio permiten registrar asistencia.
     */
    public static boolean needsSlot(String currentStatus, boolean registersNow,
                                    String targetStatus, boolean registersAfter) {
        boolean countedBefore = consumesCapacity(currentStatus) && registersNow;
        boolean countsAfter = consumesCapacity(targetStatus) && registersAfter;
        return countsAfter && !countedBefore;
    }

    /**
     * ¿Hay que cerrar las sesiones vivas del usuario tras el cambio de estado? Todo estado que no
     * sea {@code ACTIVE} deja de poder autenticarse, y sin revocar sus refresh tokens seguiría
     * renovando sesión —y registrando asistencia— con el cupo ya liberado y reasignado (RN-36).
     */
    public static boolean mustRevokeSessions(String targetStatus) {
        return !"ACTIVE".equals(targetStatus);
    }
}
