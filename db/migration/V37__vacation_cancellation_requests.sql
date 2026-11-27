-- =====================================================================
-- V37 — Solicitud de cancelación de vacaciones por el colaborador
--
-- El colaborador que ya envió una solicitud (PENDING) o que la tiene
-- aprobada y aún no empieza (APPROVED, start_date > hoy) puede pedir que se
-- cancele, con motivo obligatorio (p. ej. reagendar). RR. HH. evalúa:
--
--   status PENDING  + cancelación PENDING → Aprobar  (APPROVED, cancelación DENIED)
--                                          Rechazar (REJECTED, cancelación DENIED)
--                                          Aceptar cancelación (CANCELLED, ACCEPTED)
--   status APPROVED + cancelación PENDING → Aceptar cancelación (CANCELLED, ACCEPTED)
--                                          Denegar  (sigue APPROVED, DENIED)
--
-- REJECTED = la empresa negó las vacaciones; CANCELLED = se cancelaron a
-- petición del colaborador. CANCELLED libera los días (sale del traslape y
-- del saldo, que ya solo cuentan PENDING/APPROVED).
-- =====================================================================

ALTER TABLE vacation_requests
    ADD COLUMN cancel_request_status   varchar(20)
               CHECK (cancel_request_status IN ('PENDING','ACCEPTED','DENIED')),
    ADD COLUMN cancel_request_reason   varchar(500),
    ADD COLUMN cancel_requested_at     timestamptz,
    ADD COLUMN cancel_resolved_by      uuid REFERENCES users (id) ON DELETE SET NULL,
    ADD COLUMN cancel_resolved_at      timestamptz,
    ADD COLUMN cancel_resolution_note  varchar(1000),
    -- Una solicitud de cancelación siempre trae su motivo.
    ADD CONSTRAINT ck_vacation_cancel_reason CHECK (
        cancel_request_status IS NULL
        OR (cancel_request_reason IS NOT NULL AND length(btrim(cancel_request_reason)) > 0)),
    -- Cancelada solo por aceptación de una solicitud del colaborador. NOT VALID:
    -- no se revisan filas históricas (CANCELLED ya existía en el CHECK de V15).
    ADD CONSTRAINT ck_vacation_cancelled_by_request CHECK (
        status <> 'CANCELLED' OR cancel_request_status = 'ACCEPTED') NOT VALID;

CREATE INDEX ix_vacation_requests_cancel_pending
    ON vacation_requests (tenant_id, created_at DESC)
    WHERE cancel_request_status = 'PENDING';
