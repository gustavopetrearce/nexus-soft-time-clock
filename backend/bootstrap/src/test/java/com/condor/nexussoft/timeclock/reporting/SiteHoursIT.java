package com.condor.nexussoft.timeclock.reporting;

import com.condor.nexussoft.timeclock.reporting.application.AttendanceSummaryRow;
import com.condor.nexussoft.timeclock.reporting.application.AttendanceSummaryService;
import com.condor.nexussoft.timeclock.reporting.application.SiteHoursRow;
import com.condor.nexussoft.timeclock.reporting.application.SiteHoursService;
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
 * Desglose de horas por centro de trabajo, contra el SQL real (H4).
 *
 * <p>Una jornada puede pasar por varias sedes: {@code CAMBIO_SITIO} la traslada. Cada marca abre un
 * tramo que dura hasta la siguiente, y el centro del tramo es el de la marca que lo abre. Antes nada
 * de esto se calculaba: el reporte atribuía el periodo entero al último centro marcado.</p>
 *
 * <p>Las marcas se insertan directamente en {@code attendance_records} —aquí se prueba la agregación,
 * no el registro— con la secuencia que RN-12 admite, que es la que hace válido el reparto: los tramos
 * son contiguos, sin solape, y un descanso nunca queda a caballo de un cambio de sitio.</p>
 */
class SiteHoursIT extends PostgisIntegrationTest {

    private static final LocalDate LUNES = LocalDate.of(2026, 8, 24);

    @Autowired
    private SiteHoursService siteHours;
    @Autowired
    private AttendanceSummaryService resumen;
    @Autowired
    private JdbcTemplate jdbc;

    private UUID tenantId;
    private UUID userId;
    private UUID centroA;
    private UUID centroB;
    private UUID scheduleId;

    @BeforeEach
    void seed() {
        tenantId = UUID.randomUUID();
        userId = UUID.randomUUID();
        centroA = UUID.randomUUID();
        centroB = UUID.randomUUID();
        scheduleId = UUID.randomUUID();
        String suffix = tenantId.toString().substring(0, 8);

        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, ?)",
                tenantId, "SH-" + suffix, "Empresa de prueba");
        jdbc.update("INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name) "
                        + "VALUES (?, ?, ?, 'x', 'Ada', 'Lovelace')",
                userId, tenantId, "ada-" + suffix + "@example.com");
        crearCentro(centroA, "A-" + suffix, "Centro A");
        crearCentro(centroB, "B-" + suffix, "Centro B");
        jdbc.update("INSERT INTO schedules (id, tenant_id, code, name, timezone) "
                        + "VALUES (?, ?, ?, 'Horario', 'UTC')",
                scheduleId, tenantId, "H-" + suffix);
    }

    /**
     * El reparto del escenario de dos turnos: la primera jornada entera en A, y la segunda partida
     * por un cambio de sitio a la hora. De las 10 h del día, 6,5 son de A (330 + 60) y 3,5 de B.
     */
    @Test
    void jornadaConCambioDeSitio_reparteLasHorasEntreLosDosCentros() {
        marca(centroA, "ENTRADA", null, LUNES, 8, 0);
        marca(centroA, "INICIO_DESCANSO", null, LUNES, 11, 0);
        marca(centroA, "FIN_DESCANSO", null, LUNES, 11, 30);
        marca(centroA, "SALIDA", null, LUNES, 14, 0);
        marca(centroA, "ENTRADA", null, LUNES, 14, 30);
        marca(centroB, "CAMBIO_SITIO", null, LUNES, 15, 30);
        marca(centroB, "SALIDA", null, LUNES, 19, 0);

        assertThat(desglose()).containsExactly(
                horasEn("Centro A", 6.5),
                horasEn("Centro B", 3.5));
    }

    /** El descanso se resta del centro donde ocurre, no del otro. */
    @Test
    void descanso_seRestaDelTramoEnQueOcurre() {
        marca(centroA, "ENTRADA", null, LUNES, 8, 0);
        marca(centroA, "INICIO_DESCANSO", null, LUNES, 10, 0);
        marca(centroA, "FIN_DESCANSO", null, LUNES, 11, 0);      // 1 h de descanso, toda en A
        marca(centroB, "CAMBIO_SITIO", null, LUNES, 12, 0);
        marca(centroB, "SALIDA", null, LUNES, 16, 0);

        assertThat(desglose()).containsExactly(
                horasEn("Centro A", 3.0),    // 08:00→12:00 menos la hora de descanso
                horasEn("Centro B", 4.0));
    }

    /** Ir y volver: los tramos del mismo centro se suman en una sola fila. */
    @Test
    void variosCambiosDeSitio_sumanLosTramosDelMismoCentro() {
        marca(centroA, "ENTRADA", null, LUNES, 8, 0);
        marca(centroB, "CAMBIO_SITIO", null, LUNES, 10, 0);      // 2 h en A
        marca(centroA, "CAMBIO_SITIO", null, LUNES, 13, 0);      // 3 h en B
        marca(centroA, "SALIDA", null, LUNES, 15, 0);            // 2 h más en A

        assertThat(desglose()).containsExactly(
                horasEn("Centro A", 4.0),
                horasEn("Centro B", 3.0));
    }

    /**
     * Las extras son los últimos minutos de la jornada, así que se imputan donde se produjeron. Turno
     * de 8 h neto; se trabajan 9, y la última hora fue en B.
     */
    @Test
    void extras_seImputanAlCentroDondeSeProdujeron() {
        UUID turno = turno("Jornada", LocalTime.of(8, 0), LocalTime.of(16, 0));   // 480 netos
        asignar(turno, centroA);

        marca(centroA, "ENTRADA", turno, LUNES, 8, 0);
        marca(centroB, "CAMBIO_SITIO", turno, LUNES, 15, 0);     // 7 h en A
        marca(centroB, "SALIDA", turno, LUNES, 17, 0);           // 2 h en B → 9 h, 1 h de exceso

        assertThat(desglose()).containsExactly(
                new SiteHoursRow("—", "Ada Lovelace", "Centro A", 7.0, 0.0, 7.0),
                new SiteHoursRow("—", "Ada Lovelace", "Centro B", 2.0, 1.0, 3.0));
    }

    /**
     * Si el excedente no cabe en el último tramo, el resto sube al anterior. Turno de 4 h neto; se
     * trabajan 9, y el último tramo (en B) solo dura 2 h: 2 h de extra son de B y las otras 3 de A.
     */
    @Test
    void extras_queDesbordanElUltimoTramo_subenAlAnterior() {
        UUID turno = turno("Corto", LocalTime.of(8, 0), LocalTime.of(12, 0));     // 240 netos
        asignar(turno, centroA);

        marca(centroA, "ENTRADA", turno, LUNES, 8, 0);
        marca(centroB, "CAMBIO_SITIO", turno, LUNES, 15, 0);     // 7 h en A
        marca(centroB, "SALIDA", turno, LUNES, 17, 0);           // 2 h en B → 9 h, 5 h de exceso

        assertThat(desglose()).containsExactly(
                new SiteHoursRow("—", "Ada Lovelace", "Centro A", 7.0, 3.0, 10.0),
                new SiteHoursRow("—", "Ada Lovelace", "Centro B", 2.0, 2.0, 4.0));
    }

    /**
     * El invariante que sostiene los dos reportes: salen de los mismos tramos, así que la suma del
     * desglose es exactamente lo que el resumen atribuye al colaborador.
     */
    @Test
    void sumaDelDesglose_cuadraConElResumen() {
        UUID turno = turno("Jornada", LocalTime.of(8, 0), LocalTime.of(14, 0));   // 360 netos
        asignar(turno, centroA);

        marca(centroA, "ENTRADA", turno, LUNES, 8, 0);
        marca(centroA, "INICIO_DESCANSO", turno, LUNES, 10, 30);
        marca(centroA, "FIN_DESCANSO", turno, LUNES, 11, 0);
        marca(centroB, "CAMBIO_SITIO", turno, LUNES, 12, 15);
        marca(centroB, "SALIDA", turno, LUNES, 16, 45);

        List<SiteHoursRow> desglose = desglose();
        AttendanceSummaryRow resumida = resumen.summary(tenantId, LUNES, LUNES).get(0);

        assertThat(desglose.stream().mapToDouble(SiteHoursRow::workedHours).sum())
                .isEqualTo(resumida.workedHours());
        assertThat(desglose.stream().mapToDouble(SiteHoursRow::overtimeHours).sum())
                .isEqualTo(resumida.overtimeHours());
    }

    /** Una jornada sin SALIDA no aporta horas, así que no aparece en el desglose. */
    @Test
    void jornadaSinSalida_noApareceEnElDesglose() {
        marca(centroA, "ENTRADA", null, LUNES, 8, 0);
        marca(centroB, "CAMBIO_SITIO", null, LUNES, 12, 0);

        assertThat(desglose()).isEmpty();
    }

    /** Sin cambios de sitio el desglose es una sola fila, igual que el total del resumen. */
    @Test
    void jornadaEnUnSoloCentro_daUnaUnicaFila() {
        marca(centroA, "ENTRADA", null, LUNES, 9, 0);
        marca(centroA, "SALIDA", null, LUNES, 17, 0);

        assertThat(desglose()).containsExactly(horasEn("Centro A", 8.0));
    }

    // --- utilidades ------------------------------------------------------------------------

    private List<SiteHoursRow> desglose() {
        return siteHours.byWorkSite(tenantId, LUNES, LUNES);
    }

    /** Fila esperada sin extras: el caso habitual, para no repetir el record entero. */
    private SiteHoursRow horasEn(String centro, double horas) {
        return new SiteHoursRow("—", "Ada Lovelace", centro, horas, 0.0, horas);
    }

    private void crearCentro(UUID id, String code, String nombre) {
        jdbc.update("INSERT INTO work_sites (id, tenant_id, code, name, location) "
                        + "VALUES (?, ?, ?, ?, ST_SetSRID(ST_MakePoint(-99.1332, 19.4326), 4326)::geography)",
                id, tenantId, code, nombre);
    }

    private UUID turno(String nombre, LocalTime inicio, LocalTime fin) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO shifts (id, tenant_id, schedule_id, name, start_time, end_time, "
                        + "break_minutes) VALUES (?, ?, ?, ?, ?, ?, 0)",
                id, tenantId, scheduleId, nombre, inicio, fin);
        return id;
    }

    private void asignar(UUID shiftId, UUID workSiteId) {
        jdbc.update("INSERT INTO shift_assignments (tenant_id, user_id, shift_id, work_site_id, valid_from) "
                        + "VALUES (?, ?, ?, ?, ?)",
                tenantId, userId, shiftId, workSiteId, LUNES);
    }

    private void marca(UUID site, String eventType, UUID shiftId, LocalDate dia, int hora, int minuto) {
        jdbc.update("INSERT INTO attendance_records (id, tenant_id, server_time, user_id, work_site_id, "
                        + "shift_id, event_type, status, location, gps_accuracy_m, operation_uuid, source) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, 'ACCEPTED', "
                        + "ST_SetSRID(ST_MakePoint(-99.1332, 19.4326), 4326)::geography, 10, ?, 'ONLINE')",
                UUID.randomUUID(), tenantId,
                Timestamp.from(dia.atTime(hora, minuto).toInstant(ZoneOffset.UTC)),
                userId, site, shiftId, eventType, UUID.randomUUID());
    }
}
