package com.condor.nexussoft.timeclock.incidents.infrastructure;

import com.condor.nexussoft.timeclock.attendance.domain.event.AttendanceRegistered;
import com.condor.nexussoft.timeclock.incidents.domain.port.in.IncidentManagementUseCase;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class IncidentEventListenerTest {

    @Mock IncidentManagementUseCase incidents;

    final UUID tenantId = UUID.randomUUID();
    final UUID userId = UUID.randomUUID();
    final UUID attendanceId = UUID.randomUUID();
    final UUID siteId = UUID.randomUUID();

    private AttendanceRegistered registered(String eventKind, int minutesLate) {
        return registered(eventKind, minutesLate, false);
    }

    private AttendanceRegistered registered(String eventKind, int minutesLate, boolean outOfWindow) {
        return AttendanceRegistered.of(tenantId, attendanceId, userId, siteId, eventKind, minutesLate,
                outOfWindow, Instant.parse("2026-07-21T10:00:00Z"));
    }

    @Test
    void entradaConRetardo_abreIncidenciaRetardo() {
        IncidentEventListener listener = new IncidentEventListener(incidents);

        listener.onAttendanceRegistered(registered("ENTRADA", 12));

        verify(incidents).openForLateArrival(tenantId, userId, attendanceId, 12);
    }

    @Test
    void entradaPuntual_noAbreIncidencia() {
        IncidentEventListener listener = new IncidentEventListener(incidents);

        listener.onAttendanceRegistered(registered("ENTRADA", 0));

        verify(incidents, never()).openForLateArrival(eq(tenantId), eq(userId), eq(attendanceId), anyInt());
    }

    @Test
    void salidaConMinutos_noAbreIncidencia() {
        IncidentEventListener listener = new IncidentEventListener(incidents);

        listener.onAttendanceRegistered(registered("SALIDA", 30));

        verify(incidents, never()).openForLateArrival(eq(tenantId), eq(userId), eq(attendanceId), anyInt());
    }

    /**
     * La ventana ya no rechaza la SALIDA tardía (RN-15), pero el supervisor tiene que verla: la marca
     * aceptada fuera de ventana abre su propia incidencia.
     */
    @Test
    void marcaFueraDeVentana_abreIncidenciaFueraDeVentana() {
        IncidentEventListener listener = new IncidentEventListener(incidents);

        listener.onAttendanceRegistered(registered("SALIDA", 0, true));

        verify(incidents).openForOutOfWindow(tenantId, userId, attendanceId, "SALIDA");
    }

    @Test
    void marcaDentroDeVentana_noAbreIncidenciaFueraDeVentana() {
        IncidentEventListener listener = new IncidentEventListener(incidents);

        listener.onAttendanceRegistered(registered("SALIDA", 0));

        verify(incidents, never()).openForOutOfWindow(any(), any(), any(), any());
    }

    /** El retardo y el fuera de ventana son excluyentes: aquel exige estar dentro de la ventana. */
    @Test
    void entradaConRetardo_noAbreAdemasFueraDeVentana() {
        IncidentEventListener listener = new IncidentEventListener(incidents);

        listener.onAttendanceRegistered(registered("ENTRADA", 12));

        verify(incidents).openForLateArrival(tenantId, userId, attendanceId, 12);
        verify(incidents, never()).openForOutOfWindow(any(), any(), any(), any());
    }
}
