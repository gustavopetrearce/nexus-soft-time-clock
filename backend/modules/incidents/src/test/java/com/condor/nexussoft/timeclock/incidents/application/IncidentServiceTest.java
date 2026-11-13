package com.condor.nexussoft.timeclock.incidents.application;

import com.condor.nexussoft.timeclock.incidents.domain.Incident;
import com.condor.nexussoft.timeclock.incidents.domain.port.out.IncidentRepositoryPort;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class IncidentServiceTest {

    @Mock IncidentRepositoryPort incidents;

    final UUID tenantId = UUID.randomUUID();
    final Clock clock = Clock.fixed(Instant.parse("2026-07-21T12:00:00Z"), ZoneOffset.UTC);

    @Test
    void resolve_aprobandoUnaIncidenciaAbierta_fijaEstadoYResolutor() {
        IncidentService service = new IncidentService(incidents, clock);
        UUID incidentId = UUID.randomUUID();
        UUID resolver = UUID.randomUUID();
        Incident open = new Incident(incidentId, tenantId, UUID.randomUUID(), Incident.Type.REGISTRO_RECHAZADO,
                Incident.Status.OPEN, "MEDIUM", LocalDate.now(clock), null, "Registro rechazado",
                null, null, null, Instant.now(clock));
        when(incidents.findByIdAndTenant(incidentId, tenantId)).thenReturn(Optional.of(open));
        when(incidents.update(any())).thenAnswer(inv -> inv.getArgument(0));

        Incident result = service.resolve(tenantId, incidentId, "APPROVED", "OK, justificado", resolver);

        assertThat(result.status()).isEqualTo(Incident.Status.APPROVED);
        assertThat(result.resolvedBy()).isEqualTo(resolver);
        assertThat(result.resolvedAt()).isEqualTo(Instant.parse("2026-07-21T12:00:00Z"));
    }

    @Test
    void openForRejectedAttendance_creaIncidenciaAbiertaDeTipoRechazo() {
        IncidentService service = new IncidentService(incidents, clock);
        when(incidents.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Incident result = service.openForRejectedAttendance(tenantId, UUID.randomUUID(),
                UUID.randomUUID(), "OUT_OF_GEOFENCE");

        assertThat(result.type()).isEqualTo(Incident.Type.REGISTRO_RECHAZADO);
        assertThat(result.status()).isEqualTo(Incident.Status.OPEN);
        assertThat(result.description()).contains("OUT_OF_GEOFENCE");
    }

    @Test
    void openForLateArrival_creaIncidenciaAbiertaDeTipoRetardo() {
        IncidentService service = new IncidentService(incidents, clock);
        when(incidents.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Incident result = service.openForLateArrival(tenantId, UUID.randomUUID(), UUID.randomUUID(), 12);

        assertThat(result.type()).isEqualTo(Incident.Type.RETARDO);
        assertThat(result.status()).isEqualTo(Incident.Status.OPEN);
        assertThat(result.description()).contains("12");
    }

    @Test
    void closeForCancelledAttendance_resuelveLasAbiertasLigadasConLaCausa() {
        IncidentService service = new IncidentService(incidents, clock);
        UUID attendanceId = UUID.randomUUID();
        UUID supervisor = UUID.randomUUID();
        Incident retardo = new Incident(UUID.randomUUID(), tenantId, UUID.randomUUID(), Incident.Type.RETARDO,
                Incident.Status.OPEN, "LOW", LocalDate.now(clock), attendanceId, "Retardo de 12 min",
                null, null, null, Instant.now(clock));
        when(incidents.findOpenByRelatedAttendance(tenantId, attendanceId)).thenReturn(List.of(retardo));

        List<Incident> closed = service.closeForCancelledAttendance(tenantId, attendanceId, "Emergencia", supervisor);

        assertThat(closed).containsExactly(retardo);
        assertThat(retardo.status()).isEqualTo(Incident.Status.RESOLVED);
        assertThat(retardo.resolutionNote()).isEqualTo("Marcación cancelada: Emergencia");
        assertThat(retardo.resolvedBy()).isEqualTo(supervisor);
        verify(incidents).update(retardo);
    }
}
