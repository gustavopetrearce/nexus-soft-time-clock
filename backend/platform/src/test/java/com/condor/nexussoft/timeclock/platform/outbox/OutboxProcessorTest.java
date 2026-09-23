package com.condor.nexussoft.timeclock.platform.outbox;

import com.condor.nexussoft.timeclock.platform.audit.AuditActor;
import com.condor.nexussoft.timeclock.platform.audit.AuditContext;
import com.condor.nexussoft.timeclock.platform.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * El relay publica en un hilo del scheduler, mucho después de que terminara la petición: ahí no
 * hay SecurityContext del que deducir el autor, y desde que la V12 metió el outbox toda la
 * bitácora quedaba con actor nulo. El autor viaja ahora en la fila y se repone al publicar.
 */
class OutboxProcessorTest {

    private OutboxEventJpaRepository repository;
    private ApplicationEventPublisher publisher;
    private OutboxProcessor processor;

    @BeforeEach
    void setUp() {
        repository = mock(OutboxEventJpaRepository.class);
        publisher = mock(ApplicationEventPublisher.class);
        processor = new OutboxProcessor(repository, publisher, new ObjectMapper());
    }

    @Test
    @DisplayName("al publicar, el consumidor ve el autor y el tenant que originaron el evento")
    void reponeElContextoDelAutor() throws Exception {
        UUID tenant = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        AuditActor actor = AuditActor.ofUser(actorId, "rrhh@demo.com", "203.0.113.7", "Mozilla/5.0", "Pixel-8");
        OutboxEventJpaEntity fila = fila(tenant, actor);
        when(repository.findById(fila.getId())).thenReturn(Optional.of(fila));

        AtomicReference<AuditActor> vistoPorElConsumidor = new AtomicReference<>();
        AtomicReference<UUID> tenantVisto = new AtomicReference<>();
        doAnswer(invocation -> {
            vistoPorElConsumidor.set(AuditContext.get().orElse(null));
            tenantVisto.set(TenantContext.get().orElse(null));
            return null;
        }).when(publisher).publishEvent(any(Object.class));

        processor.processOne(fila.getId());

        assertThat(vistoPorElConsumidor.get()).isNotNull();
        assertThat(vistoPorElConsumidor.get().userId()).isEqualTo(actorId);
        assertThat(vistoPorElConsumidor.get().email()).isEqualTo("rrhh@demo.com");
        assertThat(vistoPorElConsumidor.get().ip()).isEqualTo("203.0.113.7");
        assertThat(tenantVisto.get()).isEqualTo(tenant);
        assertThat(fila.getStatus()).isEqualTo("PUBLISHED");
    }

    @Test
    @DisplayName("el contexto no se queda pegado al hilo, que vuelve al pool del scheduler")
    void limpiaElContextoTrasPublicar() throws Exception {
        OutboxEventJpaEntity fila = fila(UUID.randomUUID(),
                AuditActor.ofUser(UUID.randomUUID(), "admin@demo.com", "198.51.100.4", null, null));
        when(repository.findById(fila.getId())).thenReturn(Optional.of(fila));

        processor.processOne(fila.getId());

        assertThat(AuditContext.get()).isEmpty();
        assertThat(TenantContext.get()).isEmpty();
    }

    @Test
    @DisplayName("si el consumidor falla, el contexto tampoco se queda colgado")
    void limpiaElContextoAnteUnFallo() {
        OutboxEventJpaEntity fila = fila(UUID.randomUUID(), AuditActor.SYSTEM);
        when(repository.findById(fila.getId())).thenReturn(Optional.of(fila));
        doAnswer(invocation -> {
            throw new IllegalStateException("consumidor roto");
        }).when(publisher).publishEvent(any(Object.class));

        try {
            processor.processOne(fila.getId());
        } catch (Exception esperada) {
            // el relay la captura y marca la fila para reintento
        }

        assertThat(AuditContext.get()).isEmpty();
        assertThat(TenantContext.get()).isEmpty();
    }

    private OutboxEventJpaEntity fila(UUID tenant, AuditActor actor) {
        return new OutboxEventJpaEntity(
                UUID.randomUUID(),
                tenant,
                "DomainEvent",
                UUID.randomUUID().toString(),
                "EventoDePrueba",
                EventoDePrueba.class.getName(),
                "{\"detalle\":\"algo pasó\"}",
                Instant.parse("2026-09-22T10:15:30Z"),
                actor);
    }

    /** Evento mínimo que el relay pueda deserializar por su nombre de clase. */
    public record EventoDePrueba(String detalle) {
    }
}
