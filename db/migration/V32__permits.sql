-- =====================================================================
-- V32 — Permisos (entradas tarde, salidas temprano, faltas)
-- Nexus Soft Time Clock — PostgreSQL
--
-- Un administrador, RR. HH. o supervisor REGISTRA un permiso para un
-- colaborador; nace aprobado (no hay solicitud del empleado). Aparte, y solo
-- RR. HH. (permit:pay), decide si el permiso es con o sin goce de sueldo,
-- en el alta o después, revisando uno ya aprobado por otra persona.
--
--   type    LATE_ARRIVAL    — entrada tarde autorizada (un día, time_at = hora de llegada)
--           EARLY_DEPARTURE — salida temprano autorizada (un día, time_at = hora de salida)
--           ABSENCE         — falta autorizada (rango de días)
--   reason  lista fija; INCAPACIDAD alimenta el reporte de incapacidades.
--
-- Efecto en el reporte de asistencia (AttendanceSummaryService): una FALTA
-- cubierta por un ABSENCE aprobado cuenta como justificada y un RETARDO en
-- un día con LATE_ARRIVAL aprobado no cuenta. Las incidencias no se tocan.
-- =====================================================================

CREATE TABLE permits (
    id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid         NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    user_id         uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,   -- colaborador
    type            varchar(20)  NOT NULL
                    CHECK (type IN ('LATE_ARRIVAL','EARLY_DEPARTURE','ABSENCE')),
    reason          varchar(20)  NOT NULL
                    CHECK (reason IN ('PERSONAL','INCAPACIDAD','MEDICO','FAMILIAR','TRAMITE','OTRO')),
    notes           varchar(500),
    start_date      date         NOT NULL,
    end_date        date         NOT NULL,
    days            integer      NOT NULL CHECK (days > 0),
    time_at         time,                                   -- hora autorizada (LATE/EARLY)
    status          varchar(20)  NOT NULL DEFAULT 'APPROVED'
                    CHECK (status IN ('APPROVED','CANCELLED')),
    granted_by      uuid         REFERENCES users (id) ON DELETE SET NULL,
    cancelled_by    uuid         REFERENCES users (id) ON DELETE SET NULL,
    cancelled_at    timestamptz,
    cancel_note     varchar(500),
    pay_status      varchar(20)  NOT NULL DEFAULT 'PENDING_REVIEW'
                    CHECK (pay_status IN ('PENDING_REVIEW','WITH_PAY','WITHOUT_PAY')),
    pay_decided_by  uuid         REFERENCES users (id) ON DELETE SET NULL,
    pay_decided_at  timestamptz,
    pay_note        varchar(500),
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT ck_permits_range CHECK (end_date >= start_date),
    -- Entrada tarde / salida temprano: un solo día y con hora.
    CONSTRAINT ck_permits_time CHECK (
        (type = 'ABSENCE' AND time_at IS NULL)
        OR (type <> 'ABSENCE' AND time_at IS NOT NULL AND end_date = start_date)),
    -- Sin dos permisos vigentes del mismo tipo que se traslapen (btree_gist, V1).
    CONSTRAINT ex_permits_no_overlap
        EXCLUDE USING gist (
            user_id WITH =,
            type WITH =,
            daterange(start_date, end_date, '[]') WITH &&
        ) WHERE (status = 'APPROVED')
);

CREATE INDEX ix_permits_tenant_status ON permits (tenant_id, status, start_date);
CREATE INDEX ix_permits_tenant_user   ON permits (tenant_id, user_id, start_date DESC);
CREATE INDEX ix_permits_tenant_reason ON permits (tenant_id, reason, start_date);

CREATE TRIGGER trg_permits_updated_at BEFORE UPDATE ON permits
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE permits IS
    'Permisos registrados por admin/RR. HH./supervisor: entrada tarde, salida temprano o falta. '
    'El goce de sueldo lo decide RR. HH. (permit:pay).';

-- =====================================================================
-- RBAC
--   permit:manage → registrar, ver y cancelar (COMPANY_ADMIN, HR_ADMIN, SUPERVISOR)
--   permit:pay    → decidir goce de sueldo (solo HR_ADMIN)
-- SUPER_ADMIN no los recibe: su alcance es de plataforma (V19).
-- Se asignan a los roles plantilla y a los ya instanciados de cada empresa.
-- =====================================================================
INSERT INTO permissions (code, resource, action, description) VALUES
    ('permit:manage', 'permit', 'manage', 'Registrar, ver y cancelar permisos de colaboradores'),
    ('permit:pay',    'permit', 'pay',    'Decidir si un permiso es con o sin goce de sueldo')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.code = 'permit:manage'
WHERE r.code IN ('COMPANY_ADMIN','HR_ADMIN','SUPERVISOR')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.code = 'permit:pay'
WHERE r.code = 'HR_ADMIN'
ON CONFLICT DO NOTHING;
