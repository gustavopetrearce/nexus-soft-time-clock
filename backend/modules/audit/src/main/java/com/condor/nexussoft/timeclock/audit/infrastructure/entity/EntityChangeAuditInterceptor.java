package com.condor.nexussoft.timeclock.audit.infrastructure.entity;

import com.condor.nexussoft.timeclock.audit.application.AuditRecorder;
import com.condor.nexussoft.timeclock.platform.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.hibernate.Interceptor;
import org.hibernate.type.Type;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Audita toda escritura de negocio con sus valores anteriores y nuevos (RN-43, RN-60).
 *
 * <p>Hasta aquí la bitácora solo recogía lo que pasaba por un evento de dominio, y solo dos
 * módulos los publican (asistencia e identidad): el alta de un usuario, el cambio de una
 * geocerca o la rotación de un QR no dejaban rastro, pese a que RN-43 exige auditar el 100 % de
 * las escrituras. Engancharse al flush de Hibernate lo cubre entero sin sembrar de llamadas los
 * catorce módulos, y es el único sitio donde el estado <em>previo</em> está disponible: una vez
 * que el caso de uso guardó, ya se perdió.
 *
 * <p>Los cambios se acumulan por hilo y se vuelcan en {@code beforeCommit}: escribir durante el
 * propio flush reentraría en Hibernate en mitad de su ciclo.
 */
public class EntityChangeAuditInterceptor implements Interceptor {

    private static final Logger log = LoggerFactory.getLogger(EntityChangeAuditInterceptor.class);

    /**
     * Tablas que no se auditan.
     *
     * <ul>
     *   <li>{@code AuditLogJpaEntity}: auditar la bitácora sería un bucle.</li>
     *   <li>{@code OutboxEventJpaEntity}, {@code IdempotencyKeyJpaEntity}: fontanería técnica,
     *       no acciones de nadie.</li>
     *   <li>{@code RefreshTokenJpaEntity}: rota en cada renovación de sesión; el login y el
     *       bloqueo ya se auditan por evento.</li>
     *   <li>{@code AttendanceRecordJpaEntity}, {@code NotificationJpaEntity}: ya tienen su
     *       entrada por evento de dominio; auditarlas aquí duplicaría cada marcación.</li>
     * </ul>
     */
    private static final Set<String> NO_AUDITADAS = Set.of(
            "AuditLogJpaEntity",
            "OutboxEventJpaEntity",
            "IdempotencyKeyJpaEntity",
            "RefreshTokenJpaEntity",
            "AttendanceRecordJpaEntity",
            "NotificationJpaEntity");

    /**
     * Campos de puro rastro: cambian solos, sin que nadie haga nada.
     *
     * <p>Un cambio que SOLO los toca no se audita. Cada marcación actualiza el «visto por última
     * vez» del dispositivo, y eso llenaba la bitácora de entradas vacías —en una ejecución de las
     * pruebas de integración, 148 de 230 filas eran exactamente eso—. Aprobar o revocar ese mismo
     * dispositivo sí toca otros campos, así que sigue quedando registrado.
     *
     * <p>{@code createdAt} entra en la lista por otro motivo: es inmutable por definición, y en
     * las entidades que no lo recargan tras insertar aparece como un falso cambio a nulo.
     */
    private static final Set<String> CAMPOS_DE_RASTRO = Set.of(
            "lastseenat", "lastloginat", "lastusedat", "updatedat", "createdat");

    /** Nunca se copia un secreto a la bitácora: se registra que cambió, no cuál es. */
    private static final Set<String> CAMPOS_SENSIBLES = Set.of(
            "passwordhash", "password", "token", "tokenhash", "refreshtoken",
            "secret", "qrsecret", "pushtoken");

    private static final String ENMASCARADO = "***";

    /** Ancho de {@code audit_logs.resource_id}: una clave compuesta no puede tumbar el INSERT. */
    private static final int ID_MAX = 64;

    private static final ThreadLocal<List<CambioPendiente>> PENDIENTES =
            ThreadLocal.withInitial(ArrayList::new);

    /**
     * El recorder se resuelve tarde a propósito: depende del EntityManagerFactory que se está
     * construyendo con este interceptor, y pedirlo por constructor cerraría el ciclo.
     */
    private final ObjectProvider<AuditRecorder> recorder;
    private final ObjectMapper objectMapper;

    public EntityChangeAuditInterceptor(ObjectProvider<AuditRecorder> recorder, ObjectMapper objectMapper) {
        this.recorder = recorder;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean onSave(Object entity, Object id, Object[] state, String[] propertyNames, Type[] types) {
        registrar(entity, id, "CREATE", null, valores(propertyNames, state), state, propertyNames);
        return false;
    }

    /**
     * Hibernate 6 mantiene por compatibilidad una segunda forma de cada callback con el id como
     * {@code Serializable}. Ambas se implementan delegando en la moderna: cuál se invoca depende
     * del tipo estático del id, y un identificador sin cubrir sería una escritura sin auditar.
     */
    @Override
    public boolean onSave(Object entity, Serializable id, Object[] state, String[] propertyNames, Type[] types) {
        return onSave(entity, (Object) id, state, propertyNames, types);
    }

    @Override
    public boolean onFlushDirty(Object entity, Object id, Object[] currentState, Object[] previousState,
                                String[] propertyNames, Type[] types) {
        if (previousState == null) {
            // Sin estado previo cargado (entidad desasociada): se registra el resultado a secas.
            registrar(entity, id, "UPDATE", null, valores(propertyNames, currentState),
                    currentState, propertyNames);
            return false;
        }
        Map<String, String> antes = new LinkedHashMap<>();
        Map<String, String> despues = new LinkedHashMap<>();
        for (int i = 0; i < propertyNames.length; i++) {
            // La comparación va sobre el valor real y el enmascarado se aplica al guardar: al
            // revés, dos contraseñas distintas son "***" contra "***" y el cambio de credencial
            // —justo lo que más interesa auditar— desaparecía de la bitácora.
            if (Objects.equals(previousState[i], currentState[i])) {
                continue;
            }
            antes.put(propertyNames[i], texto(propertyNames[i], previousState[i]));
            despues.put(propertyNames[i], texto(propertyNames[i], currentState[i]));
        }
        if (despues.isEmpty() || soloRastro(despues.keySet())) {
            // Un flush sin cambio efectivo —o que solo mueve marcas de tiempo automáticas— no
            // es una acción que auditar.
            return false;
        }
        registrar(entity, id, "UPDATE", antes, despues, currentState, propertyNames);
        return false;
    }

    @Override
    public boolean onFlushDirty(Object entity, Serializable id, Object[] currentState, Object[] previousState,
                                String[] propertyNames, Type[] types) {
        return onFlushDirty(entity, (Object) id, currentState, previousState, propertyNames, types);
    }

    @Override
    public void onDelete(Object entity, Object id, Object[] state, String[] propertyNames, Type[] types) {
        registrar(entity, id, "DELETE", valores(propertyNames, state), null, state, propertyNames);
    }

    @Override
    public void onDelete(Object entity, Serializable id, Object[] state, String[] propertyNames, Type[] types) {
        onDelete(entity, (Object) id, state, propertyNames, types);
    }

    private void registrar(Object entity, Object id, String verbo, Map<String, String> antes,
                           Map<String, String> despues, Object[] state, String[] propertyNames) {
        String tipo = entity.getClass().getSimpleName();
        if (NO_AUDITADAS.contains(tipo)) {
            return;
        }
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            log.debug("Cambio en {} fuera de transacción sincronizada: no se audita", tipo);
            return;
        }
        String recurso = nombreDeRecurso(tipo);
        CambioPendiente cambio = new CambioPendiente(
                tenantDe(state, propertyNames),
                verbo + "_" + recurso,
                recurso,
                identificador(id),
                json(antes),
                json(despues));

        List<CambioPendiente> buffer = PENDIENTES.get();
        if (buffer.isEmpty()) {
            TransactionSynchronizationManager.registerSynchronization(new Volcado());
        }
        buffer.add(cambio);
    }

    private boolean soloRastro(java.util.Set<String> propiedadesCambiadas) {
        return propiedadesCambiadas.stream()
                .allMatch(p -> CAMPOS_DE_RASTRO.contains(p.toLowerCase(Locale.ROOT)));
    }

    private String identificador(Object id) {
        String texto = String.valueOf(id);
        return texto.length() <= ID_MAX ? texto : texto.substring(0, ID_MAX);
    }

    /**
     * El tenant sale de la propia fila cuando la tiene: los consumidores del outbox escriben en
     * el hilo del relay, donde el {@code TenantContext} de la petición ya no existe.
     */
    private UUID tenantDe(Object[] state, String[] propertyNames) {
        if (state != null) {
            for (int i = 0; i < propertyNames.length; i++) {
                if ("tenantId".equals(propertyNames[i]) && state[i] instanceof UUID tenant) {
                    return tenant;
                }
            }
        }
        return TenantContext.get().orElse(null);
    }

    private Map<String, String> valores(String[] propertyNames, Object[] state) {
        if (state == null) {
            return null;
        }
        Map<String, String> valores = new LinkedHashMap<>();
        for (int i = 0; i < propertyNames.length; i++) {
            valores.put(propertyNames[i], texto(propertyNames[i], state[i]));
        }
        return valores;
    }

    /**
     * Todo se guarda como texto. El estado de una entidad trae tipos que Jackson no serializa de
     * forma fiable (geometrías de JTS, enums, proxies perezosos) y la bitácora no necesita
     * tipado: necesita que se lea qué había antes y qué hay ahora, sin reventar el commit.
     */
    private String texto(String propiedad, Object valor) {
        if (valor == null) {
            return null;
        }
        if (CAMPOS_SENSIBLES.contains(propiedad.toLowerCase(Locale.ROOT))) {
            return ENMASCARADO;
        }
        return String.valueOf(valor);
    }

    private String json(Map<String, String> valores) {
        if (valores == null || valores.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(valores);
        } catch (Exception e) {
            log.warn("No se pudo serializar el detalle de auditoría: {}", e.toString());
            return null;
        }
    }

    /** {@code WorkSiteJpaEntity} → {@code WORK_SITE}. */
    private String nombreDeRecurso(String simpleName) {
        String limpio = simpleName.replace("JpaEntity", "").replace("Entity", "");
        return limpio.replaceAll("([a-z0-9])([A-Z])", "$1_$2").toUpperCase(Locale.ROOT);
    }

    private record CambioPendiente(UUID tenantId, String accion, String recurso, String recursoId,
                                   String antesJson, String despuesJson) {
    }

    /**
     * Vuelca lo acumulado justo antes del commit: dentro de la misma transacción —si el negocio
     * se deshace, su rastro también— pero ya fuera del flush que lo generó.
     */
    private final class Volcado implements TransactionSynchronization {

        @Override
        public void beforeCommit(boolean readOnly) {
            if (readOnly) {
                return;
            }
            AuditRecorder audit = recorder.getIfAvailable();
            if (audit == null) {
                log.warn("Sin AuditRecorder disponible: {} cambios sin auditar", PENDIENTES.get().size());
                return;
            }
            for (CambioPendiente cambio : List.copyOf(PENDIENTES.get())) {
                audit.record(cambio.tenantId(), cambio.accion(), cambio.recurso(),
                        cambio.recursoId(), cambio.antesJson(), cambio.despuesJson());
            }
        }

        @Override
        public void afterCompletion(int status) {
            PENDIENTES.remove();
        }
    }
}
