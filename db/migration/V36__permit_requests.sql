-- =====================================================================
-- V36 — Solicitudes de incapacidad desde la app del colaborador
--
-- Hasta V35 un permiso solo lo registraba el personal y nacía APPROVED.
-- Ahora el colaborador puede SOLICITAR una incapacidad (type ABSENCE,
-- reason INCAPACIDAD) con observaciones obligatorias: nace PENDING y quien
-- tiene permit:manage la aprueba (APPROVED) o la rechaza (REJECTED).
--
--   requested_by     colaborador que la solicitó (NULL = alta del personal)
--   resolved_by/at   quien aprobó o rechazó la solicitud
--   resolution_note  nota de la decisión
--
-- Al aprobar, granted_by = quien aprobó. Solo APPROVED cuenta en el
-- reporte de asistencia y en el traslape (ex_permits_no_overlap).
-- =====================================================================

ALTER TABLE permits DROP CONSTRAINT IF EXISTS permits_status_check;
ALTER TABLE permits ADD CONSTRAINT permits_status_check
    CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED'));

ALTER TABLE permits
    ADD COLUMN requested_by    uuid REFERENCES users (id) ON DELETE SET NULL,
    ADD COLUMN resolved_by     uuid REFERENCES users (id) ON DELETE SET NULL,
    ADD COLUMN resolved_at     timestamptz,
    ADD COLUMN resolution_note varchar(500);

-- Una solicitud del colaborador siempre trae el motivo exacto.
ALTER TABLE permits ADD CONSTRAINT ck_permits_request_notes
    CHECK (requested_by IS NULL OR (notes IS NOT NULL AND length(btrim(notes)) > 0));

COMMENT ON COLUMN permits.requested_by IS
    'Colaborador que solicitó el permiso desde la app (incapacidad); NULL si lo registró el personal.';
