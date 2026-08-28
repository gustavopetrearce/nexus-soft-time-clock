package com.condor.nexussoft.timeclock.scheduling;

import com.condor.nexussoft.timeclock.scheduling.domain.Schedule;
import com.condor.nexussoft.timeclock.scheduling.domain.Shift;
import com.condor.nexussoft.timeclock.scheduling.domain.ShiftAssignment;
import com.condor.nexussoft.timeclock.scheduling.domain.port.in.SchedulingCommands;
import com.condor.nexussoft.timeclock.scheduling.domain.port.in.SchedulingUseCase;
import com.condor.nexussoft.timeclock.support.PostgisIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Las horas de un turno son <b>hora de pared</b> del centro, no instantes: las 08:00 del turno de
 * mañana son las 08:00 se mire desde donde se mire. Esta prueba fija que atraviesan Hibernate sin
 * que las toque el huso por defecto de la JVM.
 *
 * <p>Guarda el arreglo de {@code hibernate.jdbc.time_zone: UTC}, que estaba en
 * {@code application.yml} sin ningún destinatario legítimo —el esquema no tiene una sola columna
 * {@code timestamp} sin zona— y cuyo único efecto era desplazar las dos únicas columnas {@code time}
 * del esquema, {@code shifts.start_time} y {@code shifts.end_time}. En una JVM en UTC−6 un turno de
 * {@code 08:00–14:00} llegaba al dominio como {@code 02:00–08:00}, y con él se rechazaban fichajes
 * legítimos por {@code OUT_OF_SCHEDULE} y se calculaban retardos contra una hora falsa (RN-15,
 * RN-16). Ver el addendum de ADR-003.</p>
 *
 * <p>Solo dice algo si la JVM <b>no</b> corre en UTC; de eso se encarga {@code test.timezone} en
 * {@code backend/pom.xml}, y la primera aserción lo comprueba para que la prueba no se vuelva muda si
 * alguien lo quita.</p>
 */
class ShiftTimeZoneRoundTripIT extends PostgisIntegrationTest {

    private static final LocalTime INICIO = LocalTime.of(8, 0);
    private static final LocalTime FIN = LocalTime.of(14, 0);
    private static final LocalDate VIGENCIA = LocalDate.of(2026, 8, 27);

    @Autowired
    private SchedulingUseCase scheduling;
    @Autowired
    private JdbcTemplate jdbc;

    private UUID tenantId;
    private UUID userId;
    private UUID siteId;
    private UUID scheduleId;

    @BeforeEach
    void seed() {
        tenantId = UUID.randomUUID();
        userId = UUID.randomUUID();
        siteId = UUID.randomUUID();
        String suffix = tenantId.toString().substring(0, 8);

        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, ?)",
                tenantId, "TZ-" + suffix, "Empresa de prueba");
        jdbc.update("INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name) "
                        + "VALUES (?, ?, ?, 'x', 'Ada', 'Lovelace')",
                userId, tenantId, "ada-" + suffix + "@example.com");
        jdbc.update("INSERT INTO work_sites (id, tenant_id, code, name, location) "
                        + "VALUES (?, ?, ?, 'Centro', ST_SetSRID(ST_MakePoint(-99.1332, 19.4326), 4326)::geography)",
                siteId, tenantId, "S-" + suffix);

        Schedule horario = scheduling.createSchedule(tenantId,
                new SchedulingCommands.CreateScheduleCommand("H-" + suffix, "Horario", "UTC"));
        scheduleId = horario.id();
    }

    /** Sin esto, en una JVM en UTC el resto de la prueba pasaría igual con el fallo presente. */
    @Test
    void laPruebaCorreEnUnHusoDistintoDeUtc() {
        assertThat(ZoneId.systemDefault().getRules().getOffset(java.time.Instant.now()))
                .as("esta prueba solo detecta el fallo fuera de UTC; revisa test.timezone en backend/pom.xml")
                .isNotEqualTo(ZoneOffset.UTC);
    }

    /**
     * Lo que se guarda es lo que se tecleó. Es la aserción más fuerte: mira el dato <b>en reposo</b>,
     * así que no la puede salvar una conversión simétrica al leer.
     */
    @Test
    void turnoEscritoPorHibernate_seAlmacenaConLaHoraDePared() {
        Shift turno = crearTurno("Turno mañana", INICIO, FIN, false);

        assertThat(horaEnBd(turno.id(), "start_time")).isEqualTo("08:00:00");
        assertThat(horaEnBd(turno.id(), "end_time")).isEqualTo("14:00:00");
    }

    @Test
    void turnoLeidoPorHibernate_devuelveLaHoraDePared() {
        UUID id = crearTurno("Turno mañana", INICIO, FIN, false).id();

        Shift leido = scheduling.getShift(tenantId, id);

        assertThat(leido.startTime()).isEqualTo(INICIO);
        assertThat(leido.endTime()).isEqualTo(FIN);
    }

    /**
     * La asimetría que rompió {@code JornadaDosTurnosIT}: una fila escrita fuera de Hibernate —un
     * seeder, un script de migración, una carga inicial— se leía corrida. Turno nocturno a propósito,
     * porque ahí un desplazamiento además cruza la medianoche.
     */
    @Test
    void turnoInsertadoPorSqlCrudo_seLeeSinDesplazamiento() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO shifts (id, tenant_id, schedule_id, name, start_time, end_time, "
                        + "crosses_midnight) VALUES (?, ?, ?, 'Turno noche', TIME '22:00', TIME '06:00', true)",
                id, tenantId, scheduleId);

        Shift leido = scheduling.getShift(tenantId, id);

        assertThat(leido.startTime()).isEqualTo(LocalTime.of(22, 0));
        assertThat(leido.endTime()).isEqualTo(LocalTime.of(6, 0));
    }

    /**
     * Las columnas {@code date} van por el mismo binding. Aquí se ven en la vigencia de una
     * asignación, pero el esquema tiene once campos {@code LocalDate} más (fecha de incidencia,
     * alta del empleado, rango de vacaciones), donde un corrimiento saldría como un día de más o de
     * menos en las fronteras.
     */
    @Test
    void vigenciaDeLaAsignacion_conservaLaFecha() {
        UUID shiftId = crearTurno("Turno mañana", INICIO, FIN, false).id();

        ShiftAssignment asignacion = scheduling.assignShift(tenantId,
                new SchedulingCommands.AssignShiftCommand(userId, shiftId, siteId, VIGENCIA, null));

        assertThat(jdbc.queryForObject("SELECT valid_from::text FROM shift_assignments WHERE id = ?",
                String.class, asignacion.id())).isEqualTo("2026-08-27");
        assertThat(scheduling.listAssignments(tenantId, userId))
                .singleElement()
                .extracting(ShiftAssignment::validFrom)
                .isEqualTo(VIGENCIA);
    }

    private Shift crearTurno(String nombre, LocalTime inicio, LocalTime fin, boolean cruzaMedianoche) {
        return scheduling.createShift(tenantId, scheduleId,
                new SchedulingCommands.ShiftData(nombre, inicio, fin, cruzaMedianoche,
                        30, 10, 10, 30, 30));
    }

    /** Lee la columna como texto: así el valor no vuelve a pasar por ninguna conversión de zona. */
    private String horaEnBd(UUID shiftId, String columna) {
        return jdbc.queryForObject("SELECT " + columna + "::text FROM shifts WHERE id = ?",
                String.class, shiftId);
    }
}
