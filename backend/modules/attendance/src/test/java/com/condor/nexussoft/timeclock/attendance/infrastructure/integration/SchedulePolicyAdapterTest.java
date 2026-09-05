package com.condor.nexussoft.timeclock.attendance.infrastructure.integration;

import com.condor.nexussoft.timeclock.attendance.domain.AttendanceEventType;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.SchedulePolicyPort;
import com.condor.nexussoft.timeclock.scheduling.domain.Schedule;
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
    @InjectMocks SchedulePolicyAdapter adapter;

    final UUID tenantId = UUID.randomUUID();
    final UUID userId = UUID.randomUUID();
    final UUID siteId = UUID.randomUUID();
    final UUID scheduleId = UUID.randomUUID();

    private UUID turno1;
    private UUID turno2;

    @BeforeEach
    void setUp() {
        lenient().when(scheduling.findSchedule(eqTenant(), any()))
                .thenReturn(Optional.of(
                        new Schedule(scheduleId, tenantId, "H1", "Horario", "UTC", Schedule.Status.ACTIVE)));
    }

    @Test
    void sinAsignacionVigente_noImponeRestriccionHoraria() {
        when(scheduling.listAssignments(tenantId, userId)).thenReturn(List.of());

        assertThat(check(AttendanceEventType.ENTRADA, 8, 0).outcome())
                .isEqualTo(SchedulePolicyPort.Outcome.NO_SCHEDULE);
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
