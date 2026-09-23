package com.condor.nexussoft.timeclock.audit.application;

import com.condor.nexussoft.timeclock.audit.domain.AuditLogEntry;
import com.condor.nexussoft.timeclock.audit.domain.port.out.AuditLogRepositoryPort;
import com.condor.nexussoft.timeclock.platform.audit.AuditActor;
import com.condor.nexussoft.timeclock.platform.audit.AuditContext;
import com.condor.nexussoft.timeclock.shared.domain.DomainEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * El autor de la bitácora salía del {@code SecurityContext}, que está vacío en el hilo del relay
 * del outbox: desde la V12 todas las entradas quedaban con actor nulo. Ahora sale del contexto
 * de auditoría, que el relay repone con lo que se guardó al escribir la fila (RN-60).
 */
class AuditRecorderTest {

    private AuditLogRepositoryPort auditLog;
    private AuditRecorder recorder;

    @BeforeEach
    void setUp() {
        auditLog = mock(AuditLogRepositoryPort.class);
        recorder = new AuditRecorder(auditLog, new ObjectMapper());
    }

    @AfterEach
    void tearDown() {
        AuditContext.clear();
    }

    @Test
    @DisplayName("un evento de dominio se registra con el autor que hay en el contexto")
    void eventoConActor() {
        UUID actorId = UUID.randomUUID();
        AuditContext.set(AuditActor.ofUser(actorId, "rrhh@demo.com", "203.0.113.7",
                "Mozilla/5.0", "Pixel-8"));
        EventoDePrueba evento = new EventoDePrueba(UUID.randomUUID());

        recorder.record(evento);

        AuditLogEntry entrada = capturar();
        assertThat(entrada.actorUserId()).isEqualTo(actorId);
        assertThat(entrada.actorEmail()).isEqualTo("rrhh@demo.com");
        assertThat(entrada.ip()).isEqualTo("203.0.113.7");
        assertThat(entrada.userAgent()).isEqualTo("Mozilla/5.0");
        assertThat(entrada.deviceInfo()).isEqualTo("Pixel-8");
        assertThat(entrada.action()).isEqualTo("EventoDePrueba");
        assertThat(entrada.newValuesJson()).contains("tenantId");
    }

    @Test
    @DisplayName("sin contexto la entrada se atribuye al sistema, no se inventa un autor")
    void eventoSinActor() {
        recorder.record(new EventoDePrueba(UUID.randomUUID()));

        AuditLogEntry entrada = capturar();
        assertThat(entrada.actorUserId()).isNull();
        assertThat(entrada.actorEmail()).isNull();
        assertThat(entrada.ip()).isNull();
    }

    @Test
    @DisplayName("una escritura sin evento de dominio guarda valores anteriores y nuevos")
    void escrituraDirectaConValores() {
        UUID tenant = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        AuditContext.set(AuditActor.ofUser(actorId, "admin@demo.com", "198.51.100.4", "curl", null));

        recorder.record(tenant, "UPDATE_WORK_SITE", "WORK_SITE", "sede-1",
                "{\"radiusM\":\"100\"}", "{\"radiusM\":\"250\"}");

        AuditLogEntry entrada = capturar();
        assertThat(entrada.tenantId()).isEqualTo(tenant);
        assertThat(entrada.actorUserId()).isEqualTo(actorId);
        assertThat(entrada.action()).isEqualTo("UPDATE_WORK_SITE");
        assertThat(entrada.resourceType()).isEqualTo("WORK_SITE");
        assertThat(entrada.resourceId()).isEqualTo("sede-1");
        assertThat(entrada.oldValuesJson()).contains("100");
        assertThat(entrada.newValuesJson()).contains("250");
    }

    private AuditLogEntry capturar() {
        ArgumentCaptor<AuditLogEntry> captor = ArgumentCaptor.forClass(AuditLogEntry.class);
        verify(auditLog).append(captor.capture());
        return captor.getValue();
    }

    /** Evento mínimo: al recorder solo le importa la interfaz, no de qué BC venga. */
    public record EventoDePrueba(UUID tenantId) implements DomainEvent {

        @Override
        public UUID eventId() {
            return UUID.fromString("00000000-0000-0000-0000-0000000000ee");
        }

        @Override
        public String eventType() {
            return "EventoDePrueba";
        }

        @Override
        public Instant occurredAt() {
            return Instant.parse("2026-09-22T10:15:30Z");
        }
    }
}
