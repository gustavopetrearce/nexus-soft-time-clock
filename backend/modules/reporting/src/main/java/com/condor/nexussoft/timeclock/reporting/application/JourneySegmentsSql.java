package com.condor.nexussoft.timeclock.reporting.application;

/**
 * Cadena de CTEs que parte la asistencia en <b>tramos</b>: el trozo de jornada que transcurre en un
 * mismo centro. Es la base común del resumen por colaborador y del desglose por centro, que la
 * anteponen a su propio {@code WITH}. Compartirla —en vez de duplicar la lógica en dos consultas—
 * es lo que garantiza que los dos reportes no puedan discrepar.
 *
 * <p>La unidad de arriba es la <b>jornada</b>: cada ENTRADA abre una y la SALIDA que le sigue la
 * cierra. Dentro, cada marca abre un tramo que dura hasta la siguiente, y el centro del tramo es el
 * de la marca que lo abre. Eso funciona porque RN-12 garantiza que los tramos de una jornada son
 * contiguos y sin solape: {@code CAMBIO_SITIO} es el único evento que mueve el centro, y SALIDA y los
 * descansos exigen registrarse donde la jornada está abierta, así que un descanso nunca queda a
 * caballo de un cambio de sitio.</p>
 *
 * <p>Por construcción la suma de los tramos de una jornada es su total,
 * {@code (salida − entrada) − descansos}.</p>
 *
 * <p>Requiere los parámetros {@code :tenant}, {@code :fromTs} y {@code :toTsExcl}.</p>
 */
final class JourneySegmentsSql {

    private JourneySegmentsSql() {
    }

    /** Sin el {@code WITH} inicial ni la coma final: el llamador encadena sus propios CTEs. */
    static final String CTES = """
            -- Marcas aceptadas del rango, numerando la jornada: el contador acumulado de ENTRADAs
            -- cambia de valor justo en cada ENTRADA, así que agrupa cada bloque ENTRADA..(antes de
            -- la siguiente). Las marcas anteriores a la primera ENTRADA del rango quedan en 0.
            punch AS (
                SELECT ar.user_id,
                       ar.work_site_id,
                       ar.shift_id,
                       ar.event_type,
                       ar.server_time,
                       count(*) FILTER (WHERE ar.event_type = 'ENTRADA')
                           OVER (PARTITION BY ar.user_id ORDER BY ar.server_time
                                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS journey_no
                FROM attendance_records ar
                WHERE ar.tenant_id = :tenant AND ar.status = 'ACCEPTED'
                  AND ar.server_time >= :fromTs AND ar.server_time < :toTsExcl
            ),
            journey AS (
                SELECT p.user_id,
                       p.journey_no,
                       min(p.server_time) FILTER (WHERE p.event_type = 'ENTRADA') AS entry_at,
                       max(p.server_time) FILTER (WHERE p.event_type = 'SALIDA')  AS exit_at,
                       -- El turno lo fija la ENTRADA que abre la jornada (uuid no tiene min/max).
                       (array_agg(p.shift_id ORDER BY p.server_time)
                           FILTER (WHERE p.event_type = 'ENTRADA'))[1] AS shift_id
                FROM punch p
                WHERE p.journey_no > 0
                GROUP BY p.user_id, p.journey_no
            ),
            -- Jornada neta contratada de cada turno: contra ella se miden las extras.
            shift_net AS (
                SELECT sh.id,
                       GREATEST(0,
                           (EXTRACT(EPOCH FROM (sh.end_time - sh.start_time)) / 60.0
                             + CASE WHEN sh.crosses_midnight THEN 1440 ELSE 0 END)
                           - sh.break_minutes) AS net_minutes
                FROM shifts sh
                WHERE sh.tenant_id = :tenant
            ),
            segment AS (
                SELECT p.user_id,
                       p.journey_no,
                       p.work_site_id,
                       p.event_type,
                       p.server_time AS started_at,
                       lead(p.server_time) OVER (PARTITION BY p.user_id, p.journey_no
                                                 ORDER BY p.server_time) AS ended_at
                FROM punch p
                WHERE p.journey_no > 0
            ),
            -- Solo cuenta el tramo que arranca con el colaborador trabajando —el mismo criterio que
            -- AttendanceSequenceValidator.isWorking—: el que abre INICIO_DESCANSO es el descanso, y
            -- tras la SALIDA no hay nada. Una jornada sin SALIDA no suma horas.
            segment_work AS (
                SELECT s.user_id,
                       s.journey_no,
                       s.work_site_id,
                       s.started_at,
                       (j.entry_at)::date AS d,
                       j.shift_id,
                       CASE WHEN s.ended_at IS NOT NULL
                                 AND s.event_type IN ('ENTRADA', 'FIN_DESCANSO', 'CAMBIO_SITIO')
                                 AND j.exit_at IS NOT NULL AND j.exit_at > j.entry_at
                            THEN EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 60.0
                            ELSE 0 END AS worked_min
                FROM segment s
                JOIN journey j ON j.user_id = s.user_id AND j.journey_no = s.journey_no
            ),
            journey_overtime AS (
                SELECT sw.user_id,
                       sw.journey_no,
                       CASE WHEN max(sn.net_minutes) IS NULL THEN 0
                            ELSE GREATEST(0, sum(sw.worked_min) - max(sn.net_minutes)) END AS overtime_min
                FROM segment_work sw
                LEFT JOIN shift_net sn ON sn.id = sw.shift_id
                GROUP BY sw.user_id, sw.journey_no
            ),
            -- Minutos trabajados acumulados desde el FINAL de la jornada: sirve para saber qué parte
            -- de cada tramo cae dentro de los últimos minutos, que son los que son extra.
            segment_tail AS (
                SELECT sw.user_id, sw.journey_no, sw.work_site_id, sw.started_at, sw.d, sw.worked_min,
                       sum(sw.worked_min) OVER (PARTITION BY sw.user_id, sw.journey_no
                                                ORDER BY sw.started_at DESC
                                                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS tail_min
                FROM segment_work sw
            ),
            -- Las extras de la jornada son sus últimos minutos trabajados, así que se imputan al
            -- centro donde se produjeron: si el excedente cabe en el último tramo va entero ahí, y si
            -- lo desborda, el resto sube al tramo anterior.
            segment_final AS (
                SELECT st.user_id, st.work_site_id, st.started_at, st.d, st.worked_min,
                       GREATEST(0, LEAST(st.tail_min, COALESCE(jo.overtime_min, 0))
                                   - (st.tail_min - st.worked_min)) AS overtime_min
                FROM segment_tail st
                LEFT JOIN journey_overtime jo
                       ON jo.user_id = st.user_id AND jo.journey_no = st.journey_no
            )""";
}
