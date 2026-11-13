-- =====================================================================
-- V31 — Cancelación de marcaciones
--
-- Un supervisor/administrador puede anular una marcación ya registrada
-- (llegada tarde, emergencia, permiso…). La causa es texto libre solo de
-- referencia. La fila NO se borra: pasa a status = 'CANCELLED' y conserva
-- quién, cuándo y por qué. Todos los cálculos de asistencia (secuencia de
-- jornada, horas, días asistidos, dashboard) ya filtran status='ACCEPTED',
-- de modo que la marca cancelada deja de contar sin tocar esas consultas.
-- La cancelación es definitiva (no hay restauración).
-- =====================================================================

-- 1) Nuevo estado CANCELLED. El CHECK de V6 se declaró inline y su nombre lo
--    generó PostgreSQL; se localiza por su definición en vez de asumirlo.
DO $$
DECLARE
    c record;
BEGIN
    FOR c IN
        SELECT con.conname
        FROM pg_constraint con
        WHERE con.conrelid = 'attendance_records'::regclass
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) LIKE '%PENDING_REVIEW%'
    LOOP
        EXECUTE format('ALTER TABLE attendance_records DROP CONSTRAINT %I', c.conname);
    END LOOP;
END $$;

ALTER TABLE attendance_records
    ADD CONSTRAINT attendance_records_status_check
    CHECK (status IN ('ACCEPTED','REJECTED','PENDING_REVIEW','CANCELLED'));

-- 2) Datos de la cancelación (todos nulos mientras la marca no se cancele).
ALTER TABLE attendance_records
    ADD COLUMN cancel_reason varchar(500),
    ADD COLUMN cancelled_by  uuid,
    ADD COLUMN cancelled_at  timestamptz;

ALTER TABLE attendance_records
    ADD CONSTRAINT ck_attendance_records_cancellation
    CHECK (status <> 'CANCELLED'
           OR (cancel_reason IS NOT NULL AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL));

COMMENT ON COLUMN attendance_records.cancel_reason IS
    'Causa de la cancelación (texto libre, solo referencia). Solo con status = CANCELLED.';
COMMENT ON COLUMN attendance_records.cancelled_by IS 'Usuario que canceló la marcación.';
COMMENT ON COLUMN attendance_records.cancelled_at IS 'Momento (servidor) de la cancelación.';

-- 3) RBAC — permiso para cancelar marcaciones (patrón V21).
INSERT INTO permissions (code, resource, action, description) VALUES
    ('attendance:cancel', 'attendance', 'cancel', 'Cancelar marcaciones ya registradas')
ON CONFLICT (code) DO NOTHING;

-- Roles plantilla. No se asigna a SUPER_ADMIN: V19 lo limita a la plataforma.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.code = 'attendance:cancel'
WHERE r.tenant_id IS NULL AND r.code IN ('COMPANY_ADMIN', 'HR_ADMIN', 'SUPERVISOR')
ON CONFLICT DO NOTHING;

-- Roles ya instanciados de empresas existentes.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.code = 'attendance:cancel'
WHERE r.tenant_id IS NOT NULL AND r.code IN ('COMPANY_ADMIN', 'HR_ADMIN', 'SUPERVISOR')
ON CONFLICT DO NOTHING;
