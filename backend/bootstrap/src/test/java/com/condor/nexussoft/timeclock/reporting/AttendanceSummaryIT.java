package com.condor.nexussoft.timeclock.reporting;

import com.condor.nexussoft.timeclock.reporting.application.AttendanceSummaryRow;
import com.condor.nexussoft.timeclock.reporting.application.AttendanceSummaryService;
import com.condor.nexussoft.timeclock.support.PostgisIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Horas trabajadas y extra del reporte por colaborador (RF-11, RN-17), contra el SQL real.
 *
 * <p>Las marcas se insertan directamente en {@code attendance_records}: aquí no se prueba el registro
 * —de eso van los ITs de attendance— sino cómo se agregan. Insertar a mano es además la única forma
 * de montar casos que el escenario completo no da: un descanso más largo que el nominal, un turno
 * nocturno que cruza la medianoche, o un colaborador sin turno asignado.</p>
 *
 * <p>La unidad es la <b>jornada</b> (cada ENTRADA abre una, la SALIDA la cierra), no el día natural.
 * Antes se agregaba con {@code max(SALIDA) − min(ENTRADA)} y el descanso nominal del turno, lo que
 * contaba como trabajado el hueco entre dos turnos del mismo día y partía en dos los turnos
 * nocturnos.</p>
 */
class AttendanceSummaryIT extends PostgisIntegrationTest {

    private static final LocalDate LUNES = LocalDate.of(2026, 8, 24);

    @Autowired
    private AttendanceSummaryService reporte;
    @Autowired
    private JdbcTemplate jdbc;

    private UUID tenantId;
    private UUID userId;
    private UUID siteId;
    private UUID otroSiteId;
    private UUID scheduleId;

    @BeforeEach
    void seed() {
        tenantId = UUID.randomUUID();
        userId = UUID.randomUUID();
        siteId = UUID.randomUUID();
        otroSiteId = UUID.randomUUID();
        scheduleId = UUID.randomUUID();
        String suffix = tenantId.toString().substring(0, 8);

        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, ?)",
                tenantId, "RP-" + suffix, "Empresa de prueba");
        jdbc.update("INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name) "
                        + "VALUES (?, ?, ?, 'x', 'Ada', 'Lovelace')",
                userId, tenantId, "ada-" + suffix + "@example.com");
        crearCentro(siteId, "S-" + suffix, "Centro");
        crearCentro(otroSiteId, "T-" + suffix, "Otro centro");
        jdbc.update("INSERT INTO schedules (id, tenant_id, code, name, timezone) "
                        + "VALUES (?, ?, ?, 'Horario', 'UTC')",
                scheduleId, tenantId, "H-" + suffix);
    }

    /** Turno de 8 h con 60 min de descanso nominal: jornada neta de 420 min. */
    @Test
    void descansoRealMasLargoQueElNominal_seDescuentaElReal() {
        UUID turno = turno("Jornada", LocalTime.of(9, 0), LocalTime.of(17, 0), 60, false);
        asignar(turno);

        marca("ENTRADA", turno, LUNES, 9, 0);
        marca("INICIO_DESCANSO", turno, LUNES, 13, 0);
        marca("FIN_DESCANSO", turno, LUNES, 14, 30);       // 90 min reales, no los 60 nominales
        marca("SALIDA", turno, LUNES, 17, 0);

        AttendanceSummaryRow fila = fila(LUNES, LUNES);

        assertThat(fila.workedHours()).isEqualTo(6.5);     // 480 − 90
        assertThat(fila.overtimeHours()).isZero();         // por debajo de los 420 netos
    }

    /** Y al revés: un descanso más corto que el nominal no se penaliza con el del turno. */
    @Test
    void descansoRealMasCortoQueElNominal_seDescuentaElReal() {
        UUID turno = turno("Jornada", LocalTime.of(9, 0), LocalTime.of(17, 0), 60, false);
        asignar(turno);

        marca("ENTRADA", turno, LUNES, 9, 0);
        marca("INICIO_DESCANSO", turno, LUNES, 13, 0);
        marca("FIN_DESCANSO", turno, LUNES, 13, 20);       // 20 min reales
        marca("SALIDA", turno, LUNES, 17, 0);

        AttendanceSummaryRow fila = fila(LUNES, LUNES);

        assertThat(fila.workedHours()).isEqualTo(7.7);     // 480 − 20 = 460 min
        assertThat(fila.overtimeHours()).isEqualTo(0.7);   // 460 − 420 netos = 40 min
    }

    /**
     * Dos jornadas el mismo día sin turno asignado: el hueco entre ellas no es tiempo trabajado.
     * Con la agregación anterior el día entero contaba como una sola jornada de 11 h.
     */
    @Test
    void dosJornadasElMismoDia_noCuentanElHuecoIntermedio() {
        marca("ENTRADA", null, LUNES, 8, 0);
        marca("SALIDA", null, LUNES, 12, 0);
        marca("ENTRADA", null, LUNES, 15, 0);
        marca("SALIDA", null, LUNES, 19, 0);

        AttendanceSummaryRow fila = fila(LUNES, LUNES);

        assertThat(fila.workedHours()).isEqualTo(8.0);     // 4 h + 4 h, no 11
        assertThat(fila.attendedDays()).isEqualTo(1);
        assertThat(fila.overtimeHours()).isZero();         // sin turno atribuido no hay contra qué medir
    }

    /**
     * Turno nocturno: la ENTRADA cae en un día y la SALIDA en el siguiente. Como la jornada se fecha
     * por su ENTRADA, cuenta una vez y con sus 8 h. Antes se partía en dos días de 0 h cada uno,
     * porque ninguno tenía a la vez ENTRADA y SALIDA.
     */
    @Test
    void turnoNocturno_noSePartePorLaMedianoche() {
        UUID turno = turno("Noche", LocalTime.of(22, 0), LocalTime.of(6, 0), 0, true);
        asignar(turno);

        marca("ENTRADA", turno, LUNES, 22, 0);
        marca("SALIDA", turno, LUNES.plusDays(1), 6, 0);

        AttendanceSummaryRow fila = fila(LUNES, LUNES.plusDays(1));

        assertThat(fila.workedHours()).isEqualTo(8.0);
        assertThat(fila.attendedDays()).isEqualTo(1);
        assertThat(fila.overtimeHours()).isZero();         // 480 trabajados = 480 netos
    }

    /** Las extras se miden por jornada: un déficit en una no compensa el exceso de la otra. */
    @Test
    void extrasSeMidenPorTurno_sinCompensarEntreJornadas() {
        UUID manana = turno("Mañana", LocalTime.of(8, 0), LocalTime.of(12, 0), 0, false);   // 240 netos
        UUID tarde = turno("Tarde", LocalTime.of(15, 0), LocalTime.of(19, 0), 0, false);    // 240 netos
        asignar(manana);
        asignar(tarde);

        marca("ENTRADA", manana, LUNES, 8, 0);
        marca("SALIDA", manana, LUNES, 11, 0);            // 180: 60 min de déficit
        marca("ENTRADA", tarde, LUNES, 15, 0);
        marca("SALIDA", tarde, LUNES, 20, 0);             // 300: 60 min de exceso

        AttendanceSummaryRow fila = fila(LUNES, LUNES);

        assertThat(fila.workedHours()).isEqualTo(8.0);     // 180 + 300
        assertThat(fila.overtimeHours()).isEqualTo(1.0);   // solo el exceso de la tarde
    }

    /** Una jornada abandonada no suma horas, pero el día sigue contando como asistido. */
    @Test
    void jornadaSinSalida_noSumaHorasPeroCuentaComoAsistencia() {
        marca("ENTRADA", null, LUNES, 8, 0);

        AttendanceSummaryRow fila = fila(LUNES, LUNES);

        assertThat(fila.workedHours()).isZero();
        assertThat(fila.attendedDays()).isEqualTo(1);
    }

    /**
     * El centro de la fila es donde más trabajó, no el último donde marcó. Con un cambio de sitio al
     * final del día, "el último" señalaba a la sede donde estuvo menos tiempo.
     */
    @Test
    void workCenter_esElCentroDondeMasTrabajo_noElUltimoMarcado() {
        marca("ENTRADA", null, LUNES, 8, 0);
        marcaEn(otroSiteId, "CAMBIO_SITIO", null, LUNES, 14, 0);   // 6 h en Centro, 1 h en Otro centro
        marcaEn(otroSiteId, "SALIDA", null, LUNES, 15, 0);

        AttendanceSummaryRow fila = fila(LUNES, LUNES);

        assertThat(fila.workedHours()).isEqualTo(7.0);
        assertThat(fila.workCenter()).isEqualTo("Centro");
    }

    /** Una marca rechazada en otra sede no decide el centro de la fila. */
    @Test
    void workCenter_ignoraLasMarcasRechazadas() {
        marca("ENTRADA", null, LUNES, 8, 0);
        marca("SALIDA", null, LUNES, 16, 0);
        marcaConEstado(otroSiteId, "ENTRADA", null, LUNES, 18, 0, "REJECTED");

        assertThat(fila(LUNES, LUNES).workCenter()).isEqualTo("Centro");
    }

    /** Las marcas rechazadas no entran en el cálculo. */
    @Test
    void marcasRechazadas_noCuentan() {
        marca("ENTRADA", null, LUNES, 8, 0);
        marca("SALIDA", null, LUNES, 12, 0);
        marcaConEstado("ENTRADA", null, LUNES, 14, 0, "REJECTED");
        marcaConEstado("SALIDA", null, LUNES, 18, 0, "REJECTED");

        assertThat(fila(LUNES, LUNES).workedHours()).isEqualTo(4.0);
    }

    // --- utilidades ------------------------------------------------------------------------

    private UUID turno(String nombre, LocalTime inicio, LocalTime fin, int descansoMin, boolean cruzaMedianoche) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO shifts (id, tenant_id, schedule_id, name, start_time, end_time, "
                        + "break_minutes, crosses_midnight) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                id, tenantId, scheduleId, nombre, inicio, fin, descansoMin, cruzaMedianoche);
        return id;
    }

    private void asignar(UUID shiftId) {
        jdbc.update("INSERT INTO shift_assignments (tenant_id, user_id, shift_id, work_site_id, valid_from) "
                        + "VALUES (?, ?, ?, ?, ?)",
                tenantId, userId, shiftId, siteId, LUNES);
    }

    private void crearCentro(UUID id, String code, String nombre) {
        jdbc.update("INSERT INTO work_sites (id, tenant_id, code, name, location) "
                        + "VALUES (?, ?, ?, ?, ST_SetSRID(ST_MakePoint(-99.1332, 19.4326), 4326)::geography)",
                id, tenantId, code, nombre);
    }

    private void marca(String eventType, UUID shiftId, LocalDate dia, int hora, int minuto) {
        marcaEn(siteId, eventType, shiftId, dia, hora, minuto);
    }

    private void marcaEn(UUID site, String eventType, UUID shiftId, LocalDate dia, int hora, int minuto) {
        marcaConEstado(site, eventType, shiftId, dia, hora, minuto, "ACCEPTED");
    }

    private void marcaConEstado(String eventType, UUID shiftId, LocalDate dia, int hora, int minuto, String estado) {
        marcaConEstado(siteId, eventType, shiftId, dia, hora, minuto, estado);
    }

    private void marcaConEstado(UUID site, String eventType, UUID shiftId, LocalDate dia, int hora,
                                int minuto, String estado) {
        jdbc.update("INSERT INTO attendance_records (id, tenant_id, server_time, user_id, work_site_id, "
                        + "shift_id, event_type, status, location, gps_accuracy_m, operation_uuid, source) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, "
                        + "ST_SetSRID(ST_MakePoint(-99.1332, 19.4326), 4326)::geography, 10, ?, 'ONLINE')",
                UUID.randomUUID(), tenantId,
                Timestamp.from(dia.atTime(hora, minuto).toInstant(ZoneOffset.UTC)),
                userId, site, shiftId, eventType, estado, UUID.randomUUID());
    }

    private AttendanceSummaryRow fila(LocalDate desde, LocalDate hasta) {
        List<AttendanceSummaryRow> filas = reporte.summary(tenantId, desde, hasta);
        assertThat(filas).hasSize(1);
        return filas.get(0);
    }
}
