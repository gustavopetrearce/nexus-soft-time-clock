package com.condor.nexussoft.timeclock.attendance;

import com.condor.nexussoft.timeclock.attendance.domain.port.in.AttendanceResult;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.RegisterAttendanceCommand;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.RegisterAttendanceUseCase;
import com.condor.nexussoft.timeclock.geofencing.domain.port.in.GeofencingUseCase;
import com.condor.nexussoft.timeclock.reporting.application.AttendanceSummaryRow;
import com.condor.nexussoft.timeclock.reporting.application.AttendanceSummaryService;
import com.condor.nexussoft.timeclock.reporting.application.SiteHoursRow;
import com.condor.nexussoft.timeclock.reporting.application.SiteHoursService;
import com.condor.nexussoft.timeclock.support.MutableClock;
import com.condor.nexussoft.timeclock.support.PostgisIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Caso de uso completo de un colaborador con <b>dos turnos el mismo día</b>, que es la combinación
 * que RN-12 declara válida ("un mismo día admite varios turnos") y que ninguna prueba ejercitaba:
 * {@code AttendanceSequenceIT} evita sembrar turnos a propósito para medir solo la secuencia, y los
 * tests unitarios nunca cruzan dos asignaciones vigentes.
 *
 * <pre>
 *   T1 08:00-14:00 @ Centro A          T2 14:30-19:00 @ Centro A y Centro B
 *   08:00  ENTRADA          @ A
 *   11:00  INICIO_DESCANSO  @ A
 *   11:30  FIN_DESCANSO     @ A        (descanso real de 30 min)
 *   14:00  SALIDA           @ A
 *   14:30  ENTRADA          @ A
 *   15:30  CAMBIO_SITIO     @ B        (cubre el resto del turno en el otro centro)
 *   19:00  SALIDA           @ B
 * </pre>
 *
 * <p>La secuencia (RN-12) y la ventana de turno (RN-15/RN-16) ya sostienen el día entero. El cálculo
 * de horas (RN-17) no: su prueba es de <b>caracterización</b>, fija el comportamiento actual —que no
 * es el correcto— y su javadoc dice cuál sería.</p>
 */
@Import(JornadaDosTurnosIT.FixedServerClock.class)
class JornadaDosTurnosIT extends PostgisIntegrationTest {

    /** Jueves: cuenta como día hábil en los "días esperados" del reporte. */
    private static final LocalDate DIA = LocalDate.of(2026, 8, 27);

    private static final double LAT_A = 19.4326;
    private static final double LON_A = -99.1332;
    private static final double LAT_B = 19.5000;
    private static final double LON_B = -99.2000;

    /**
     * Sustituye el {@code Clock.systemUTC()} de producción ({@code IdentityBeansConfig.serverClock}).
     * Es {@code @Primary} porque aquel sigue en el contexto; la inyección por tipo de
     * {@code RegisterAttendanceService}, {@code GeofencingService} e {@code IncidentService} se
     * resuelve a este. Hace falta un reloj movible y no el truco de mover {@code server_time} por
     * SQL: aquí la hora gobierna además la ventana del turno y la fecha de la incidencia.
     */
    @TestConfiguration
    static class FixedServerClock {
        @Bean
        @Primary
        MutableClock testClock() {
            return new MutableClock(DIA.atTime(8, 0).toInstant(ZoneOffset.UTC));
        }
    }

    @Autowired
    private RegisterAttendanceUseCase attendance;
    @Autowired
    private GeofencingUseCase geofencing;
    @Autowired
    private AttendanceSummaryService reporte;
    @Autowired
    private SiteHoursService horasPorCentro;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private MutableClock clock;

    private UUID tenantId;
    private UUID userId;
    private UUID sitioA;
    private UUID sitioB;
    private UUID turno1;
    private UUID turno2;
    private String qrA;
    private String qrB;

    /**
     * Siembra la organización mínima del escenario. Los turnos se dejan con los defaults de
     * {@code V4__scheduling.sql} (tolerancia 10 min, ventana ±30 min) porque son los de producción,
     * y son los que hacen que las dos ventanas se solapen entre las 14:00 y las 14:30.
     */
    @BeforeEach
    void seed() {
        clock.set(DIA.atTime(8, 0).toInstant(ZoneOffset.UTC));

        tenantId = UUID.randomUUID();
        userId = UUID.randomUUID();
        sitioA = UUID.randomUUID();
        sitioB = UUID.randomUUID();
        String suffix = tenantId.toString().substring(0, 8);

        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, ?)",
                tenantId, "IT-" + suffix, "Empresa de prueba");
        jdbc.update("INSERT INTO company_settings (company_id) VALUES (?)", tenantId);
        jdbc.update("INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, "
                        + "employee_code) VALUES (?, ?, ?, 'x', 'Ada', 'Lovelace', ?)",
                userId, tenantId, "ada-" + suffix + "@example.com", "EMP-" + suffix);

        crearCentro(sitioA, "A-" + suffix, "Centro A", LAT_A, LON_A);
        crearCentro(sitioB, "B-" + suffix, "Centro B", LAT_B, LON_B);

        // Zona explícita: sin ella el adapter cae al fallback UTC igualmente, pero el escenario
        // razona en horas absolutas y conviene que eso quede escrito.
        UUID horarioId = UUID.randomUUID();
        jdbc.update("INSERT INTO schedules (id, tenant_id, code, name, timezone) "
                        + "VALUES (?, ?, ?, 'Horario partido', 'UTC')",
                horarioId, tenantId, "H-" + suffix);

        turno1 = crearTurno(horarioId, "Turno 1", LocalTime.of(8, 0), LocalTime.of(14, 0), 30);
        turno2 = crearTurno(horarioId, "Turno 2", LocalTime.of(14, 30), LocalTime.of(19, 0), 0);

        asignar(turno1, sitioA);
        asignar(turno2, sitioA);
        asignar(turno2, sitioB);   // el turno 2 también se cubre desde el centro B

        // Un QR por centro, con la vigencia larga del cartel impreso (ADR-006 addendum).
        qrA = generarQr(sitioA);
        qrB = generarQr(sitioB);
    }

    /**
     * La secuencia de RN-12 sostiene el día entero: el descanso emparejado, la segunda ENTRADA tras
     * la SALIDA del primer turno, y el CAMBIO_SITIO —único evento que traslada el centro de la
     * jornada— seguido de una SALIDA en el centro nuevo.
     */
    @Test
    void jornadaDeDosTurnos_conDescansoYCambioDeSitio_seAceptaCompleta() {
        recorrerJornadaCompleta();

        List<String> orden = jdbc.queryForList(
                "SELECT event_type FROM attendance_records WHERE tenant_id = ? AND status = 'ACCEPTED' "
                        + "ORDER BY server_time", String.class, tenantId);
        assertThat(orden).containsExactly("ENTRADA", "INICIO_DESCANSO", "FIN_DESCANSO", "SALIDA",
                "ENTRADA", "CAMBIO_SITIO", "SALIDA");

        // Cada marca queda atribuida a su turno: la SALIDA de las 14:00 al primero (está en su fin)
        // y la ENTRADA de las 14:30 al segundo (está en su inicio), pese a solaparse las ventanas.
        assertThat(jdbc.queryForList(
                "SELECT shift_id FROM attendance_records WHERE tenant_id = ? AND status = 'ACCEPTED' "
                        + "ORDER BY server_time", UUID.class, tenantId))
                .containsExactly(turno1, turno1, turno1, turno1, turno2, turno2, turno2);

        // Cinco eventos en A y dos en B; un solo QR por centro para todos ellos (RN-26).
        assertThat(aceptadosEn(sitioA)).isEqualTo(5);
        assertThat(aceptadosEn(sitioB)).isEqualTo(2);
        assertThat(jdbc.queryForList(
                "SELECT DISTINCT qr_nonce FROM attendance_records WHERE tenant_id = ? AND status = 'ACCEPTED'",
                String.class, tenantId)).hasSize(2);
    }

    /**
     * Las dos ventanas se solapan entre las 14:00 y las 14:30 —la de T1 llega hasta las 14:30, que es
     * justo cuando empieza T2— y antes ganaba la que apareciera primero: una ENTRADA puntual a las
     * 14:30 podía medirse contra las 08:00 y salir con 380 min de retardo y su incidencia. Ahora la
     * marca es del turno cuyo borde correspondiente está más cerca, así que es de T2 y llega puntual.
     *
     * <p>Ya no hace falta borrar T2 para que el resultado sea determinista: lo es por construcción,
     * no por el orden en que Postgres devuelva las asignaciones.</p>
     */
    @Test
    void entradaAlInicioDelSegundoTurno_noSeMideContraElPrimero() {
        AttendanceResult entrada = registrar(14, 30, "ENTRADA", sitioA);

        assertThat(entrada.status()).isEqualTo("ACCEPTED");
        assertThat(entrada.flags()).doesNotContain("LATE");
        assertThat(entrada.minutesLate()).isZero();
        assertThat(turnoDe(entrada)).isEqualTo(turno2);

        // Sin retardo no hay nada que abrir: el evento que va a incidencias por el outbox (ADR-005)
        // llega con 0, así que IncidentEventListener no crea el RETARDO.
        Integer minutosDelEvento = jdbc.queryForObject(
                "SELECT (payload->>'minutesLate')::int FROM outbox_events "
                        + "WHERE tenant_id = ? AND event_type = 'AttendanceRegistered'",
                Integer.class, tenantId);
        assertThat(minutosDelEvento).isZero();
    }

    /** Elegir bien el turno no perdona la tardanza: a las 15:00 sí llega tarde, y a T2. */
    @Test
    void entradaTardiaAlSegundoTurno_sigueMarcandoRetardo() {
        AttendanceResult entrada = registrar(15, 0, "ENTRADA", sitioA);

        assertThat(entrada.flags()).contains("LATE");
        assertThat(entrada.minutesLate()).isEqualTo(20);   // 15:00 − (14:30 + 10 de tolerancia)
        assertThat(turnoDe(entrada)).isEqualTo(turno2);
    }

    /**
     * El día se cuenta por <b>jornadas</b>, no de la primera ENTRADA a la última SALIDA: 330 min en el
     * turno 1 (seis horas menos el descanso real de 30) más 270 en el turno 2 son <b>600 min</b>. El
     * hueco de 14:00 a 14:30 entre turnos no es tiempo trabajado, y las extras son <b>0</b> porque
     * cada jornada cubrió exactamente la jornada neta de su turno.
     *
     * <p>Antes salían 630 min y 300 de extras: se agregaba el día como {@code max(SALIDA) −
     * min(ENTRADA)} y se restaba el {@code break_minutes} nominal de una sola asignación, elegida
     * arbitrariamente entre las del colaborador.</p>
     */
    @Test
    void reporteDeHoras_deUnDiaDeDosTurnos_cuentaCadaJornadaPorSeparado() {
        recorrerJornadaCompleta();

        AttendanceSummaryRow fila = unicaFila();

        assertThat(fila.attendedDays()).isEqualTo(1);
        assertThat(fila.expectedDays()).isEqualTo(1);
        assertThat(fila.workedHours()).isEqualTo(10.0);
        assertThat(fila.overtimeHours()).isZero();
        // El centro de la fila es donde más trabajó, no donde terminó el día.
        assertThat(fila.workCenter()).isEqualTo("Centro A");
    }

    /**
     * Las 10 h se reparten entre las dos sedes: 6,5 en A (la primera jornada entera más la hora
     * anterior al cambio de sitio) y 3,5 en B. Antes el día se atribuía completo al centro donde
     * terminó.
     */
    @Test
    void desgloseDeHorasPorCentro_reparteLaJornadaPartida() {
        recorrerJornadaCompleta();

        assertThat(horasPorCentro.byWorkSite(tenantId, DIA, DIA)).containsExactly(
                new SiteHoursRow("EMP-" + tenantId.toString().substring(0, 8), "Ada Lovelace",
                        "Centro A", 6.5, 0.0, 6.5),
                new SiteHoursRow("EMP-" + tenantId.toString().substring(0, 8), "Ada Lovelace",
                        "Centro B", 3.5, 0.0, 3.5));
    }

    /**
     * La ventana del turno gobierna cuándo se puede <b>abrir</b> la jornada, no cuándo cerrarla: una
     * SALIDA pasada la ventana se acepta y la cierra. Antes se rechazaba con {@code OUT_OF_SCHEDULE} y
     * el colaborador se quedaba con la jornada abierta hasta que caducara por
     * {@code open_shift_max_hours} (RN-12).
     *
     * <p>La marca queda con la bandera y su evento sale marcado, que es por donde Incidents abre la
     * {@code FUERA_DE_VENTANA}. El relay del outbox está frenado en los ITs, así que de la incidencia
     * en sí se encarga {@code IncidentEventListenerTest}.</p>
     */
    @Test
    void salidaFueraDeLaVentanaDelTurno_seAceptaYQuedaMarcada() {
        aceptado(14, 30, "ENTRADA", sitioA);
        aceptado(15, 30, "CAMBIO_SITIO", sitioB);

        AttendanceResult salida = registrar(19, 45, "SALIDA", sitioB);   // ventana de T2: hasta 19:30

        assertThat(salida.status()).isEqualTo("ACCEPTED");
        assertThat(salida.rejectionReason()).isNull();
        assertThat(salida.flags()).contains("OUT_OF_SCHEDULE");

        Boolean fueraDeVentana = jdbc.queryForObject(
                "SELECT (payload->>'outOfWindow')::boolean FROM outbox_events "
                        + "WHERE tenant_id = ? AND event_type = 'AttendanceRegistered' "
                        + "AND payload->>'attendanceId' = ?",
                Boolean.class, tenantId, salida.recordId().toString());
        assertThat(fueraDeVentana).isTrue();
    }

    /** La ENTRADA sí se sigue rechazando fuera de ventana: RN-10 la exige dentro para ser válida. */
    @Test
    void entradaFueraDeLaVentanaDelTurno_seRechaza() {
        AttendanceResult entrada = registrar(6, 0, "ENTRADA", sitioA);   // ventana de T1: desde 07:30

        assertThat(entrada.status()).isEqualTo("REJECTED");
        assertThat(entrada.rejectionReason()).isEqualTo("OUT_OF_SCHEDULE");
    }

    // --- siembra ---------------------------------------------------------------------------

    private void crearCentro(UUID id, String code, String nombre, double lat, double lon) {
        jdbc.update("INSERT INTO work_sites (id, tenant_id, code, name, location) "
                        + "VALUES (?, ?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography)",
                id, tenantId, code, nombre, lon, lat);
        jdbc.update("INSERT INTO geofences (tenant_id, work_site_id, type, center, radius_m) "
                        + "VALUES (?, ?, 'CIRCLE', ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, 200)",
                tenantId, id, lon, lat);
    }

    private UUID crearTurno(UUID horarioId, String nombre, LocalTime inicio, LocalTime fin, int descansoMin) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO shifts (id, tenant_id, schedule_id, name, start_time, end_time, "
                        + "break_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)",
                id, tenantId, horarioId, nombre, inicio, fin, descansoMin);
        return id;
    }

    private void asignar(UUID shiftId, UUID workSiteId) {
        jdbc.update("INSERT INTO shift_assignments (tenant_id, user_id, shift_id, work_site_id, valid_from) "
                        + "VALUES (?, ?, ?, ?, ?)",
                tenantId, userId, shiftId, workSiteId, DIA);
    }

    private String generarQr(UUID siteId) {
        return geofencing.generateQr(tenantId, siteId, null,
                clock.instant().plus(30, ChronoUnit.DAYS)).token();
    }

    // --- ejecución -------------------------------------------------------------------------

    private void recorrerJornadaCompleta() {
        aceptado(8, 0, "ENTRADA", sitioA);
        aceptado(11, 0, "INICIO_DESCANSO", sitioA);
        aceptado(11, 30, "FIN_DESCANSO", sitioA);
        aceptado(14, 0, "SALIDA", sitioA);
        aceptado(14, 30, "ENTRADA", sitioA);
        aceptado(15, 30, "CAMBIO_SITIO", sitioB);
        aceptado(19, 0, "SALIDA", sitioB);
    }

    private void aceptado(int hora, int minuto, String eventType, UUID siteId) {
        AttendanceResult r = registrar(hora, minuto, eventType, siteId);
        assertThat(r.rejectionReason()).as("%s a las %02d:%02d", eventType, hora, minuto).isNull();
        assertThat(r.status()).as("%s a las %02d:%02d", eventType, hora, minuto).isEqualTo("ACCEPTED");
    }

    /** Mueve la hora de servidor al instante del evento y registra la pulsación. */
    private AttendanceResult registrar(int hora, int minuto, String eventType, UUID siteId) {
        clock.set(DIA.atTime(hora, minuto).toInstant(ZoneOffset.UTC));
        return attendance.register(tenantId, userId, cmd(eventType, siteId));
    }

    private AttendanceSummaryRow unicaFila() {
        List<AttendanceSummaryRow> filas = reporte.summary(tenantId, DIA, DIA);
        assertThat(filas).hasSize(1);
        return filas.get(0);
    }

    /** El turno al que quedó atribuida la marca, leído de la fila persistida. */
    private UUID turnoDe(AttendanceResult resultado) {
        return jdbc.queryForObject("SELECT shift_id FROM attendance_records WHERE id = ?",
                UUID.class, resultado.recordId());
    }

    private Integer aceptadosEn(UUID siteId) {
        return jdbc.queryForObject("SELECT count(*) FROM attendance_records "
                        + "WHERE tenant_id = ? AND work_site_id = ? AND status = 'ACCEPTED'",
                Integer.class, tenantId, siteId);
    }

    /** Cada pulsación lleva su propio operationUuid, como hace el móvil (RN-51). */
    private RegisterAttendanceCommand cmd(String eventType, UUID siteId) {
        boolean esA = siteId.equals(sitioA);
        return new RegisterAttendanceCommand(UUID.randomUUID(), siteId, esA ? qrA : qrB,
                esA ? LAT_A : LAT_B, esA ? LON_A : LON_B, 10.0,
                eventType, "device-it-1", null, "ONLINE",
                false, false, false, false, true, false,
                null, null, null, "ANDROID", "Pixel 7", "14");
    }
}
