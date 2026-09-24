package com.condor.nexussoft.timeclock.platform.audit;

import java.util.Optional;

/**
 * Portador del autor de la acción en curso (RN-60): quién, desde dónde y con qué.
 *
 * <p>Hermano de {@code TenantContext} y con la misma disciplina: lo fija un filtro al entrar la
 * petición y lo limpia al salir, porque el hilo vuelve al pool y el siguiente no puede heredar
 * al usuario del anterior.
 *
 * <p>También lo restaura el relay del outbox antes de publicar un evento: la petición que lo
 * originó terminó hace rato, así que el autor viaja guardado en la propia fila del outbox.
 */
public final class AuditContext {

    private static final ThreadLocal<AuditActor> CURRENT = new ThreadLocal<>();

    private AuditContext() {
    }

    public static void set(AuditActor actor) {
        CURRENT.set(actor);
    }

    public static Optional<AuditActor> get() {
        return Optional.ofNullable(CURRENT.get());
    }

    public static void clear() {
        CURRENT.remove();
    }
}
