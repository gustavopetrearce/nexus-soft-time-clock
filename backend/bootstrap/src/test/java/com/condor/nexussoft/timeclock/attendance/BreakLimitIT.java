package com.condor.nexussoft.timeclock.attendance;

import com.condor.nexussoft.timeclock.attendance.domain.BreakAllowancePolicy.Availability;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.AttendanceResult;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.BreakOptionsUseCase;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.RegisterAttendanceCommand;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.RegisterAttendanceUseCase;
import com.condor.nexussoft.timeclock.geofencing.domain.port.in.GeofencingUseCase;
import com.condor.nexussoft.timeclock.scheduling.domain.Shift;
import com.condor.nexussoft.timeclock.scheduling.domain.port.in.SchedulingCommands;
import com.condor.nexussoft.timeclock.scheduling.domain.port.in.SchedulingUseCase;
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
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Límites de descanso (V38) con el SQL real: cada turno admite sus categorías (matutino almuerzo y
 * comida, vespertino solo comida, nocturno ninguna) y cada categoría se usa una vez por día, aunque
 * el colaborador salga y vuelva a entrar. Los turnos se crean por el caso de uso de Scheduling para
 * probar también que las reglas se guardan.
 */
@Import(BreakLimitIT.FixedServerClock.class)
class BreakLimitIT extends PostgisIntegrationTest {

    private static final LocalDate DIA = LocalDate.of(2026, 8, 27);
    private static final double LAT = 19.4326;
    private static final double LON = -99.1332;

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
    private BreakOptionsUseCase breakOptions;
    @Autowired
    private SchedulingUseCase scheduling;
    @Autowired
    private GeofencingUseCase geofencing;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private MutableClock clock;

    private UUID tenantId;
    private UUID sitio;
    private String qr;
    private UUID almuerzo;
    private UUID comida;
    private UUID horario;
    private String suffix;

    @BeforeEach
    void seed() {
        clock.set(DIA.atTime(6, 0).toInstant(ZoneOffset.UTC));
        tenantId = UUID.randomUUID();
        sitio = UUID.randomUUID();
        suffix = tenantId.toString().substring(0, 8);
        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, 'Empresa de prueba')", tenantId, "BL-" + suffix);
        jdbc.update("INSERT INTO company_settings (company_id) VALUES (?)", tenantId);
        jdbc.update("INSERT INTO work_sites (id, tenant_id, code, name, location) "
                        + "VALUES (?, ?, ?, 'Centro', ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography)",
                sitio, tenantId, "S-" + suffix, LON, LAT);
        jdbc.update("INSERT INTO geofences (tenant_id, work_site_id, type, center, radius_m) "
                        + "VALUES (?, ?, 'CIRCLE', ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, 200)",
                tenantId, sitio, LON, LAT);
        qr = geofencing.generateQr(tenantId, sitio, null, clock.instant().plus(30, ChronoUnit.DAYS)).token();

        almuerzo = breakType("ALMUERZO", "Almuerzo", 0);
        comida = breakType("COMIDA", "Comida", 1);

        horario = UUID.randomUUID();
        jdbc.update("INSERT INTO schedules (id, tenant_id, code, name, timezone) VALUES (?, ?, ?, 'Turnos', 'UTC')",
                horario, tenantId, "H-" + suffix);
    }

    @Test
    void matutino_almuerzoYComidaUnaVezCadaUno_inclusoTrasSalirYVolverAEntrar() {
        UUID ada = user("ada");
        UUID matutino = shift("Matutino", LocalTime.of(7, 0), LocalTime.of(15, 0), false, true, Set.of(almuerzo, comida));
        assign(ada, matutino);

        Shift guardado = scheduling.getShift(tenantId, matutino);
        assertThat(guardado.breaksRestricted()).isTrue();
        assertThat(guardado.allowedBreakTypeIds()).containsExactlyInAnyOrder(almuerzo, comida);

        accepted(ada, at(7, 0), "ENTRADA", null);
        accepted(ada, at(10, 0), "INICIO_DESCANSO", almuerzo);
        accepted(ada, at(10, 30), "FIN_DESCANSO", null);

        assertThat(options(ada)).containsEntry("ALMUERZO", Availability.ALREADY_USED)
                .containsEntry("COMIDA", Availability.AVAILABLE);

        assertThat(register(ada, at(11, 0), "INICIO_DESCANSO", almuerzo).rejectionReason())
                .isEqualTo("BREAK_ALREADY_USED");
        accepted(ada, at(12, 0), "INICIO_DESCANSO", comida);
        accepted(ada, at(12, 45), "FIN_DESCANSO", null);
        assertThat(register(ada, at(13, 0), "INICIO_DESCANSO", comida).rejectionReason())
                .isEqualTo("BREAK_ALREADY_USED");

        // Salir y volver a entrar el mismo día no devuelve el almuerzo.
        accepted(ada, at(13, 10), "SALIDA", null);
        accepted(ada, at(13, 20), "ENTRADA", null);
        assertThat(register(ada, at(13, 30), "INICIO_DESCANSO", almuerzo).rejectionReason())
                .isEqualTo("BREAK_ALREADY_USED");
    }

    @Test
    void vespertino_soloComida() {
        UUID beto = user("beto");
        assign(beto, shift("Vespertino", LocalTime.of(15, 0), LocalTime.of(23, 0), false, true, Set.of(comida)));

        accepted(beto, at(15, 0), "ENTRADA", null);
        assertThat(options(beto)).containsEntry("ALMUERZO", Availability.NOT_ALLOWED_FOR_SHIFT)
                .containsEntry("COMIDA", Availability.AVAILABLE);
        assertThat(register(beto, at(17, 0), "INICIO_DESCANSO", almuerzo).rejectionReason())
                .isEqualTo("BREAK_NOT_ALLOWED_FOR_SHIFT");
        accepted(beto, at(18, 0), "INICIO_DESCANSO", comida);
    }

    @Test
    void nocturno_ningunDescanso_niPasadaLaMedianoche() {
        UUID ciro = user("ciro");
        assign(ciro, shift("Nocturno", LocalTime.of(23, 0), LocalTime.of(7, 0), true, true, Set.of()));

        accepted(ciro, at(23, 0), "ENTRADA", null);
        LocalDateTime madrugada = DIA.plusDays(1).atTime(2, 0);
        assertThat(register(ciro, madrugada, "INICIO_DESCANSO", comida).rejectionReason())
                .isEqualTo("BREAK_NOT_ALLOWED_FOR_SHIFT");
        assertThat(register(ciro, madrugada, "INICIO_DESCANSO", almuerzo).rejectionReason())
                .isEqualTo("BREAK_NOT_ALLOWED_FOR_SHIFT");
    }

    @Test
    void turnoSinRestriccion_oSinTurno_admiteTodas_peroUnaVezPorDia() {
        UUID dora = user("dora");
        // Sin turno asignado: NO_SCHEDULE, pero el uso único por día sigue aplicando.
        accepted(dora, at(9, 0), "ENTRADA", null);
        assertThat(options(dora)).containsEntry("ALMUERZO", Availability.AVAILABLE)
                .containsEntry("COMIDA", Availability.AVAILABLE);
        accepted(dora, at(10, 0), "INICIO_DESCANSO", almuerzo);
        accepted(dora, at(10, 30), "FIN_DESCANSO", null);
        assertThat(register(dora, at(11, 0), "INICIO_DESCANSO", almuerzo).rejectionReason())
                .isEqualTo("BREAK_ALREADY_USED");

        // Al día siguiente, de nuevo disponible.
        accepted(dora, at(18, 0), "SALIDA", null);
        LocalDateTime manana = DIA.plusDays(1).atTime(9, 0);
        accepted(dora, manana, "ENTRADA", null);
        accepted(dora, manana.plusHours(1), "INICIO_DESCANSO", almuerzo);
    }

    // --- siembra ---------------------------------------------------------------------------

    private UUID breakType(String code, String label, int order) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO attendance_break_types (id, tenant_id, code, label, enabled, paid, sort_order) "
                + "VALUES (?, ?, ?, ?, true, false, ?)", id, tenantId, code, label, order);
        return id;
    }

    private UUID user(String alias) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, employee_code) "
                        + "VALUES (?, ?, ?, 'x', ?, 'Lovelace', ?)",
                id, tenantId, alias + "-" + suffix + "@example.com", alias, alias.toUpperCase() + "-" + suffix);
        return id;
    }

    private UUID shift(String name, LocalTime start, LocalTime end, boolean crossesMidnight,
                       boolean restricted, Set<UUID> allowed) {
        return scheduling.createShift(tenantId, horario,
                new SchedulingCommands.ShiftData(name, start, end, crossesMidnight, 60, 10, 10, 30, 30),
                new SchedulingCommands.BreakRules(restricted, allowed)).id();
    }

    private void assign(UUID userId, UUID shiftId) {
        jdbc.update("INSERT INTO shift_assignments (tenant_id, user_id, shift_id, work_site_id, valid_from) "
                + "VALUES (?, ?, ?, ?, ?)", tenantId, userId, shiftId, sitio, DIA.minusDays(1));
    }

    // --- ejecución -------------------------------------------------------------------------

    private static LocalDateTime at(int hour, int minute) {
        return DIA.atTime(hour, minute);
    }

    private Map<String, Availability> options(UUID userId) {
        return breakOptions.optionsFor(tenantId, userId).stream()
                .collect(Collectors.toMap(o -> o.breakType().code(), BreakOptionsUseCase.BreakOption::availability));
    }

    private void accepted(UUID userId, LocalDateTime when, String eventType, UUID breakTypeId) {
        AttendanceResult r = register(userId, when, eventType, breakTypeId);
        assertThat(r.rejectionReason()).as("%s %s", eventType, when).isNull();
    }

    private AttendanceResult register(UUID userId, LocalDateTime when, String eventType, UUID breakTypeId) {
        clock.set(when.toInstant(ZoneOffset.UTC));
        return attendance.register(tenantId, userId, new RegisterAttendanceCommand(UUID.randomUUID(), sitio, qr,
                LAT, LON, 10.0, eventType, "device-" + userId, null, "ONLINE",
                false, false, false, false, true, false, null, null, null, "ANDROID", "Pixel 7", "14", breakTypeId));
    }
}
