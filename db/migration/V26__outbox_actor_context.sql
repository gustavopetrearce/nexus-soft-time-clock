-- =====================================================================
-- V26 — El actor viaja con el evento del outbox (RN-60)
-- =====================================================================
-- Desde la V12 los eventos de dominio no se publican en la transacción de negocio, sino que
-- los republica el relay (@Scheduled) tras el commit. Ese hilo no tiene SecurityContext, así
-- que AuditRecorder.currentActor() devolvía NULL para TODOS los eventos: la bitácora registraba
-- qué pasó, pero nunca quién lo hizo, y RN-60 exige usuario, IP, navegador y dispositivo.
--
-- El contexto no se puede reconstruir al publicar —la petición ya terminó—, así que se captura
-- al escribir la fila, que sí ocurre dentro de la petición, y el relay lo restaura antes de
-- entregar el evento a los consumidores.

ALTER TABLE outbox_events
    ADD COLUMN actor_user_id    uuid,
    ADD COLUMN actor_email      varchar(255),
    ADD COLUMN actor_ip         varchar(45),
    ADD COLUMN actor_user_agent varchar(400),
    ADD COLUMN actor_device     varchar(200);

COMMENT ON COLUMN outbox_events.actor_user_id IS
    'Quién provocó el evento, capturado al escribir la fila. El relay lo restaura al publicar '
    'para que la auditoría (RN-60) sepa el autor; NULL si lo originó el sistema (jobs, siembra).';
COMMENT ON COLUMN outbox_events.actor_ip IS
    'IP de origen como texto: aquí no se consulta por red, y evita el cast a inet en cada INSERT. '
    'En audit_logs sí se conserva el tipo inet.';
