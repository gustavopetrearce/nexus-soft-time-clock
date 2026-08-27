package com.condor.nexussoft.timeclock.attendance.domain;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;

class ScheduleWindowValidatorTest {

    private final LocalTime start = LocalTime.of(9, 0);
    private final LocalTime end = LocalTime.of(18, 0);

    private boolean within(LocalDateTime now) {
        // ventana: 08:45 (9:00 - 15) .. 18:30 (18:00 + 30)
        return ScheduleWindowValidator.withinWindow(start, end, false, 15, 30, now);
    }

    @Test
    void dentroDeLaVentanaDeEntrada() {
        assertThat(within(LocalDateTime.of(2026, 7, 21, 8, 50))).isTrue();  // 10 min antes, dentro de tolerancia
    }

    @Test
    void justoAntesDeLaVentana_esFuera() {
        assertThat(within(LocalDateTime.of(2026, 7, 21, 8, 30))).isFalse(); // 30 min antes, fuera
    }

    @Test
    void dentroDeLaJornada() {
        assertThat(within(LocalDateTime.of(2026, 7, 21, 13, 0))).isTrue();
    }

    @Test
    void despuesDeLaVentanaDeSalida_esFuera() {
        assertThat(within(LocalDateTime.of(2026, 7, 21, 19, 0))).isFalse(); // pasada la tolerancia de salida
    }

    @Test
    void turnoNocturno_cruzaMedianoche_madrugadaSiguienteEstaDentro() {
        // turno 22:00 -> 06:00, ventana 21:45 .. 06:30 del día siguiente
        LocalTime nightStart = LocalTime.of(22, 0);
        LocalTime nightEnd = LocalTime.of(6, 0);
        LocalDateTime madrugada = LocalDateTime.of(2026, 7, 22, 2, 0);  // 02:00 del día siguiente
        assertThat(ScheduleWindowValidator.withinWindow(nightStart, nightEnd, true, 15, 30, madrugada)).isTrue();
    }

    @Test
    void turnoNocturno_fueraDeVentana_alMediodia() {
        LocalTime nightStart = LocalTime.of(22, 0);
        LocalTime nightEnd = LocalTime.of(6, 0);
        LocalDateTime mediodia = LocalDateTime.of(2026, 7, 22, 12, 0);
        assertThat(ScheduleWindowValidator.withinWindow(nightStart, nightEnd, true, 15, 30, mediodia)).isFalse();
    }

    // --- distancia de referencia: a qué turno pertenece la marca cuando dos ventanas se solapan ---

    private final ScheduleWindowValidator.Occurrence jornada = new ScheduleWindowValidator.Occurrence(
            LocalDateTime.of(2026, 7, 21, 9, 0), LocalDateTime.of(2026, 7, 21, 18, 0));

    private long distancia(AttendanceEventType eventType, int hora, int minuto) {
        return jornada.referenceDistanceMinutes(eventType, LocalDateTime.of(2026, 7, 21, hora, minuto));
    }

    @Test
    void entradaSeMideContraElInicio() {
        assertThat(distancia(AttendanceEventType.ENTRADA, 9, 20)).isEqualTo(20);
        assertThat(distancia(AttendanceEventType.ENTRADA, 8, 45)).isEqualTo(15);   // anticipada, misma escala
    }

    @Test
    void salidaSeMideContraElFin() {
        assertThat(distancia(AttendanceEventType.SALIDA, 18, 10)).isEqualTo(10);
        // Lo que evita atribuir la salida al turno siguiente: contra el inicio serían 9 h.
        assertThat(distancia(AttendanceEventType.SALIDA, 18, 0)).isZero();
    }

    @Test
    void eventosIntermediosPertenecenAlTurnoEnCuyoCuerpoCaen() {
        assertThat(distancia(AttendanceEventType.INICIO_DESCANSO, 13, 0)).isZero();
        assertThat(distancia(AttendanceEventType.CAMBIO_SITIO, 9, 0)).isZero();     // en el borde
        assertThat(distancia(AttendanceEventType.FIN_DESCANSO, 18, 25)).isEqualTo(25);
        assertThat(distancia(AttendanceEventType.INICIO_DESCANSO, 8, 40)).isEqualTo(20);
    }

    @Test
    void ocurrenciaYaEmpezada_desempataHaciaElTurnoEnCurso() {
        assertThat(jornada.startedBy(LocalDateTime.of(2026, 7, 21, 9, 0))).isTrue();
        assertThat(jornada.startedBy(LocalDateTime.of(2026, 7, 21, 8, 59))).isFalse();
    }

    /** En un turno nocturno la ocurrencia que casa es la de ayer, y sus bordes van fechados. */
    @Test
    void turnoNocturno_devuelveLaOcurrenciaDeAyerConSusDosBordes() {
        LocalDateTime madrugada = LocalDateTime.of(2026, 7, 22, 2, 0);

        ScheduleWindowValidator.Occurrence occurrence = ScheduleWindowValidator.matchedOccurrence(
                LocalTime.of(22, 0), LocalTime.of(6, 0), true, 15, 30, madrugada).orElseThrow();

        assertThat(occurrence.start()).isEqualTo(LocalDateTime.of(2026, 7, 21, 22, 0));
        assertThat(occurrence.end()).isEqualTo(LocalDateTime.of(2026, 7, 22, 6, 0));
        assertThat(occurrence.referenceDistanceMinutes(AttendanceEventType.SALIDA, madrugada)).isEqualTo(240);
    }
}
