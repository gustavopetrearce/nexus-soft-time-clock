package com.condor.nexussoft.timeclock.attendance.infrastructure.integration;

import com.condor.nexussoft.timeclock.attendance.domain.AttendanceEventType;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.SchedulePolicyPort;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.ShiftZonePort;
import com.condor.nexussoft.timeclock.scheduling.domain.Shift;
import com.condor.nexussoft.timeclock.scheduling.domain.ShiftAssignment;
import com.condor.nexussoft.timeclock.scheduling.domain.port.in.SchedulingUseCase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * A qué turno pertenece una marca cuando el colaborador tiene <b>varios turnos el mismo día</b>
 * (RN-12) y sus ventanas de registro se solapan.
 *
 * <p>Con turnos de 08:00–14:00 y 14:30–19:00 y la ventana por defecto de ±30 min, las ventanas son
 * {@code [07:30, 14:30]} y {@code [14:00, 19:30]}: entre las 14:00 y las 14:30 las dos reclaman la
 * marca. El adaptador se quedaba con la primera que apareciera, sobre una lista sin orden, así que
 * una ENTRADA puntual a las 14:30 podía medirse contra las 08:00 y salir con 380 min de retardo y su
 * incidencia. Ahora gana el turno cuyo borde correspondiente al evento está más cerca.</p>
 */
@ExtendWith(MockitoExtension.class)
class SchedulePolicyAdapterTest {

    private static final LocalDate DIA = LocalDate.of(2026, 8, 27);

    @Mock SchedulingUseCase scheduling;
    @Mock ShiftZonePort zones;
    @InjectMocks SchedulePolicyAdapter adapter;

    final UUID tenantId = UUID.randomUUID();
    final UUID userId = UUID.randomUUID();
    final UUID siteId = UUID.randomUUID();
    final UUID scheduleId = UUID.randomUUID();

    private UUID turno1;
    private UUID turno2;

    @BeforeEach
    void setUp() {
        enZona(ZoneId.of("UTC"));
    }

    private void enZona(ZoneId zone) {
        lenient().when(zones.resolve(eqTenant(), any(), any())).thenReturn(zone);
    }

    @Test
    void sinAsignacionVigente_noImponeRestriccionHoraria() {
        when(scheduling.listAssignments(tenantId, userId)).thenReturn(List.of());

        assertThat(check(AttendanceEventType.ENTRADA, 8, 0).outcome())
                .isEqualTo(SchedulePolicyPort.Outcome.NO_SCHEDULE);
    }

    /**
     * MarcaciÃ³n sin centro (QR de empresa): no hay contra quÃ© filtrar, asÃ­ que se evalÃºan todas las
     * asignaciones vigentes del colaborador. Sin esto, el camino sin centro se quedarÃ­a sin control
     * horario ây antes de la guarda, el filtro reventaba con NullPointerExceptionâ.
     */
    @Test
    void sinCentro_evaluaCualquierTurnoAsignado() {
        Shift t1 = turno("Turno 1", LocalTime.of(8, 0), LocalTime.of(14, 0));
        turno1 = t1.id();
        stubShifts(t1);
        when(scheduling.listAssignments(tenantId, userId))
                .thenReturn(List.of(asignacion(turno1, UUID.randomUUID())));

        Instant at = DIA.atTime(8, 20).toInstant(ZoneOffset.UTC);
        SchedulePolicyPort.ScheduleDecision d =
                adapter.check(tenantId, userId, null, AttendanceEventType.ENTRADA, at);

        assertThat(d.outcome()).isEqualTo(SchedulePolicyPort.Outcome.WITHIN_WINDOW);
        assertThat(d.shiftId()).isEqualTo(turno1);
        assertThat(d.minutesLate()).isEqualTo(10);
    }

    /** Un turno asignado en otro centro no gobierna el horario de este. */
    @Test
    void asignacionEnOtroCentro_seIgnora() {
        Shift t1 = turno("Turno 1", LocalTime.of(8, 0), LocalTime.of(14, 0));
        turno1 = t1.id();
        stubShifts(t1);
        when(scheduling.listAssignments(tenantId, userId))
                .thenReturn(List.of(asignacion(turno1, UUID.randomUUID())));

        assertThat(check(AttendanceEventType.ENTRADA, 8, 0).outcome())
                .isEqualTo(SchedulePolicyPort.Outcome.NO_SCHEDULE);
    }

    @Test
    void unSoloTurno_dentroDeVentana_calculaLaTardanzaSobreSuInicio() {
        unTurno();

        SchedulePolicyPort.ScheduleDecision d = check(AttendanceEventType.ENTRADA, 8, 20);

        assertThat(d.outcome()).isEqualTo(SchedulePolicyPort.Outcome.WITHIN_WINDOW);
        assertThat(d.shiftId()).isEqualTo(turno1);
        assertThat(d.minutesLate()).isEqualTo(10);   // 08:20 − (08:00 + 10 de tolerancia)
    }

    @Test
    void unSoloTurno_fueraDeTodaVentana_rechaza() {
        unTurno();

        assertThat(check(AttendanceEventType.ENTRADA, 17, 0).outcome())
                .isEqualTo(SchedulePolicyPort.Outcome.OUT_OF_WINDOW);
    }

    /** El caso que motivó el arreglo: llega puntual al segundo turno y no debe salir con retardo. */
    @Test
    void solape_entradaAlInicioDelSegundoTurno_seAtribuyeAlSegundo() {
        dosTurnos();

        SchedulePolicyPort.ScheduleDecision d = check(AttendanceEventType.ENTRADA, 14, 30);

        assertThat(d.shiftId()).isEqualTo(turno2);
        assertThat(d.minutesLate()).isZero();
    }

    /** Simétrico para quien llega antes: 14:15 está a 15 min de T2 y a 375 de T1. */
    @Test
    void solape_entradaAnticipadaAlSegundoTurno_seAtribuyeAlSegundo() {
        dosTurnos();

        SchedulePolicyPort.ScheduleDecision d = check(AttendanceEventType.ENTRADA, 14, 15);

        assertThat(d.shiftId()).isEqualTo(turno2);
        assertThat(d.minutesLate()).isZero();
    }

    /**
     * Una SALIDA se mide contra el <b>fin</b>, no contra el inicio: a las 14:00 está en el fin de T1
     * y a 30 min del inicio de T2. Medir contra el inicio la atribuiría al turno equivocado.
     */
    @Test
    void solape_salidaAlFinDelPrimerTurno_seAtribuyeAlPrimero() {
        dosTurnos();

        assertThat(check(AttendanceEventType.SALIDA, 14, 0).shiftId()).isEqualTo(turno1);
    }

    /** Los intermedios pertenecen al turno en cuyo cuerpo caen. */
    @Test
    void descansoDentroDelPrimerTurno_seAtribuyeAlPrimero() {
        dosTurnos();

        assertThat(check(AttendanceEventType.INICIO_DESCANSO, 11, 0).shiftId()).isEqualTo(turno1);
    }

    /**
     * El fallo original no era solo elegir mal, era elegir <b>al azar</b>: la consulta de
     * asignaciones no lleva orden. La misma pregunta con la lista dada al revés debe responder igual.
     */
    @Test
    void solape_elOrdenDeLasAsignacionesNoCambiaElResultado() {
        Shift t1 = turno("Turno 1", LocalTime.of(8, 0), LocalTime.of(14, 0));
        Shift t2 = turno("Turno 2", LocalTime.of(14, 30), LocalTime.of(19, 0));
        turno1 = t1.id();
        turno2 = t2.id();
        stubShifts(t1, t2);

        when(scheduling.listAssignments(tenantId, userId))
                .thenReturn(List.of(asignacion(turno1, siteId), asignacion(turno2, siteId)))
                .thenReturn(List.of(asignacion(turno2, siteId), asignacion(turno1, siteId)));

        SchedulePolicyPort.ScheduleDecision primera = check(AttendanceEventType.ENTRADA, 14, 30);
        SchedulePolicyPort.ScheduleDecision segunda = check(AttendanceEventType.ENTRADA, 14, 30);

        assertThat(primera).isEqualTo(segunda);
        assertThat(primera.shiftId()).isEqualTo(turno2);
    }

    /**
     * Elegir bien el turno no perdona la tardanza: con T1 08:00–16:00 y T2 14:00–19:00 solapados, una
     * ENTRADA a las 14:45 pertenece a T2 y llega 35 min tarde sobre su tolerancia.
     */
    @Test
    void solape_conTardanzaReal_seMideContraElTurnoElegido() {
        Shift t1 = turno("Turno 1", LocalTime.of(8, 0), LocalTime.of(16, 0));
        Shift t2 = turno("Turno 2", LocalTime.of(14, 0), LocalTime.of(19, 0));
        turno1 = t1.id();
        turno2 = t2.id();
        stubShifts(t1, t2);
        when(scheduling.listAssignments(tenantId, userId))
                .thenReturn(List.of(asignacion(turno1, siteId), asignacion(turno2, siteId)));

        SchedulePolicyPort.ScheduleDecision d = check(AttendanceEventType.ENTRADA, 14, 45);

        assertThat(d.shiftId()).isEqualTo(turno2);
        assertThat(d.minutesLate()).isEqualTo(35);   // 14:45 − (14:00 + 10 de tolerancia)
    }

    // --- el caso de producción: CN-000234, 2026-09-14 ----------------------------------------

    /**
     * Horario sin zona y empresa a UTC−6, con los turnos reales del colaborador. La marca de las
     * <b>13:29:12 locales</b> se evaluaba en UTC —19:29:12— y ahí caía de lleno en la ventana del
     * turno de la noche, que la reclamaba con <b>124 min</b> de retardo sobre su inicio de las 17:15.
     *
     * <p>En hora local no la reclama ninguno: el turno 3 es el más cercano y su ventana abre 48
     * segundos más tarde. El rechazo por llegar pronto es honesto; el retardo de dos horas contra un
     * turno que aún no había empezado, no.</p>
     */
    @Test
    void turnosReales_marcaSeEvaluaEnLaZonaDelCentro_noEnUtc() {
        turnosDeProduccion();
        enZona(ZoneId.of("America/Mexico_City"));

        SchedulePolicyPort.ScheduleDecision d = adapter.check(tenantId, userId, siteId,
                AttendanceEventType.ENTRADA, Instant.parse("2026-09-14T19:29:12Z"));

        assertThat(d.outcome()).isEqualTo(SchedulePolicyPort.Outcome.OUT_OF_WINDOW);
        assertThat(d.shiftId()).isEqualTo(turno1);   // turno 3: el inicio más cercano
        assertThat(d.minutesLate()).isZero();
    }

    /** La misma siembra evaluada en UTC reproduce el retardo de 124 min que se vio en producción. */
    @Test
    void turnosReales_enUtc_reproduceElRetardoDe124Minutos() {
        turnosDeProduccion();
        enZona(ZoneId.of("UTC"));

        SchedulePolicyPort.ScheduleDecision d = adapter.check(tenantId, userId, siteId,
                AttendanceEventType.ENTRADA, Instant.parse("2026-09-14T19:29:12Z"));

        assertThat(d.outcome()).isEqualTo(SchedulePolicyPort.Outcome.WITHIN_WINDOW);
        assertThat(d.shiftId()).isEqualTo(turno2);   // turno 4
        assertThat(d.minutesLate()).isEqualTo(124);  // 19:29:12 − (17:15 + 10 de tolerancia)
    }

    /**
     * El gemelo, que sobrevive al arreglo de la zona horaria: a las 16:30 la ventana del turno 4 aún
     * no ha abierto (16:45) pero la del turno 3 sigue abierta hasta las 17:40. Antes el turno 3 era
     * el único candidato y se llevaba la marca con 140 min de retardo contra su inicio de las 14:00.
     */
    @Test
    void entradaAnticipadaAlSegundoTurno_noLaReclamaElPrimeroConUnRetardoFantasma() {
        turnosDeProduccion();
        enZona(ZoneId.of("America/Mexico_City"));

        SchedulePolicyPort.ScheduleDecision d = adapter.check(tenantId, userId, siteId,
                AttendanceEventType.ENTRADA, Instant.parse("2026-09-14T22:30:00Z"));   // 16:30 local

        assertThat(d.outcome()).isEqualTo(SchedulePolicyPort.Outcome.OUT_OF_WINDOW);
        assertThat(d.shiftId()).isEqualTo(turno2);   // turno 4, el que de verdad va a empezar
        assertThat(d.minutesLate()).isZero();
    }

    /** Y con la ventana previa ensanchada a 60 min, esa misma entrada se acepta y llega puntual. */
    @Test
    void entradaAnticipadaAlSegundoTurno_conVentanaPreviaAncha_seAceptaPuntual() {
        Shift t3 = turno("Turno 3", LocalTime.of(14, 0), LocalTime.of(17, 10));
        Shift t4 = turnoConVentana("Turno 4", LocalTime.of(17, 15), LocalTime.of(23, 30), 60, 30);
        sembrar(t3, t4);
        enZona(ZoneId.of("America/Mexico_City"));

        SchedulePolicyPort.ScheduleDecision d = adapter.check(tenantId, userId, siteId,
                AttendanceEventType.ENTRADA, Instant.parse("2026-09-14T22:30:00Z"));   // 16:30 local

        assertThat(d.outcome()).isEqualTo(SchedulePolicyPort.Outcome.WITHIN_WINDOW);
        assertThat(d.shiftId()).isEqualTo(turno2);
        assertThat(d.minutesLate()).isZero();
    }

    /** Llegar tarde al turno de la noche sigue contando, y contra el inicio de ese turno. */
    @Test
    void turnosReales_entradaTardiaAlSegundoTurno_mideContraSuInicio() {
        turnosDeProduccion();
        enZona(ZoneId.of("America/Mexico_City"));

        SchedulePolicyPort.ScheduleDecision d = adapter.check(tenantId, userId, siteId,
                AttendanceEventType.ENTRADA, Instant.parse("2026-09-14T23:45:00Z"));   // 17:45 local

        assertThat(d.outcome()).isEqualTo(SchedulePolicyPort.Outcome.WITHIN_WINDOW);
        assertThat(d.shiftId()).isEqualTo(turno2);
        assertThat(d.minutesLate()).isEqualTo(20);   // 17:45 − (17:15 + 10 de tolerancia)
    }

    /** Turno 3 · 14:00–17:10 y turno 4 · 17:15–23:30, con los defaults de V4 (10 / 30 / 30). */
    private void turnosDeProduccion() {
        sembrar(turno("Turno 3", LocalTime.of(14, 0), LocalTime.of(17, 10)),
                turno("Turno 4", LocalTime.of(17, 15), LocalTime.of(23, 30)));
    }

    private void sembrar(Shift primero, Shift segundo) {
        turno1 = primero.id();
        turno2 = segundo.id();
        stubShifts(primero, segundo);
        when(scheduling.listAssignments(tenantId, userId))
                .thenReturn(List.of(asignacion(turno1, siteId), asignacion(turno2, siteId)));
    }

    // --- utilidades ------------------------------------------------------------------------

    private void unTurno() {
        Shift t1 = turno("Turno 1", LocalTime.of(8, 0), LocalTime.of(14, 0));
        turno1 = t1.id();
        stubShifts(t1);
        when(scheduling.listAssignments(tenantId, userId)).thenReturn(List.of(asignacion(turno1, siteId)));
    }

    private void dosTurnos() {
        Shift t1 = turno("Turno 1", LocalTime.of(8, 0), LocalTime.of(14, 0));
        Shift t2 = turno("Turno 2", LocalTime.of(14, 30), LocalTime.of(19, 0));
        turno1 = t1.id();
        turno2 = t2.id();
        stubShifts(t1, t2);
        when(scheduling.listAssignments(tenantId, userId))
                .thenReturn(List.of(asignacion(turno1, siteId), asignacion(turno2, siteId)));
    }

    private void stubShifts(Shift... shifts) {
        for (Shift s : shifts) {
            lenient().when(scheduling.findShift(tenantId, s.id())).thenReturn(Optional.of(s));
        }
    }

    /** Turno con los defaults de V4__scheduling.sql: tolerancia 10 min, ventana ±30. */
    private Shift turno(String nombre, LocalTime inicio, LocalTime fin) {
        return new Shift(UUID.randomUUID(), tenantId, scheduleId, nombre, inicio, fin, false,
                30, 10, 10, 30, 30);
    }

    /** Turno con la ventana de registro a medida; el resto, los defaults de V4. */
    private Shift turnoConVentana(String nombre, LocalTime inicio, LocalTime fin,
                                  int ventanaAntes, int ventanaDespues) {
        return new Shift(UUID.randomUUID(), tenantId, scheduleId, nombre, inicio, fin, false,
                30, 10, 10, ventanaAntes, ventanaDespues);
    }

    private ShiftAssignment asignacion(UUID shiftId, UUID site) {
        return new ShiftAssignment(UUID.randomUUID(), tenantId, userId, shiftId, site, DIA, null);
    }

    private SchedulePolicyPort.ScheduleDecision check(AttendanceEventType eventType, int hora, int minuto) {
        Instant at = DIA.atTime(hora, minuto).toInstant(ZoneOffset.UTC);
        return adapter.check(tenantId, userId, siteId, eventType, at);
    }

    private UUID eqTenant() {
        return org.mockito.ArgumentMatchers.eq(tenantId);
    }
}
