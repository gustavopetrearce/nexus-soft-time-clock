-- =====================================================================
-- V33 — Contratos de colaboradores (iteración 14, fase 1)
-- Nexus Soft Time Clock — PostgreSQL
--
-- Tipo de contrato por colaborador (RF-30):
--   PROJECT — por proyecto: el contrato ES la asignación del colaborador al
--             proyecto; su vigencia no puede salirse de la del proyecto (RN-64,
--             validado en el servicio porque el proyecto puede cambiar).
--   SHIFT   — por turno/horario: periodo de empleo; dentro de él se asignan
--             turnos (shift_assignments). ends_on NULL = indefinido.
--
-- Estados:
--   ACTIVE    — vigente o futuro.
--   ENDED     — terminado anticipadamente (ends_on se recorta a la fecha de término).
--   CANCELLED — capturado por error; definitivo, con causa, y deja de contar.
--
-- Un colaborador no puede tener dos contratos no cancelados que se traslapen
-- (RN-63), garantizado por exclusión (btree_gist, V1).
-- =====================================================================

CREATE TABLE employment_contracts (
    id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid         NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    user_id         uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    contract_type   varchar(20)  NOT NULL CHECK (contract_type IN ('PROJECT','SHIFT')),
    project_id      uuid         REFERENCES projects (id) ON DELETE RESTRICT,
    work_site_id    uuid         REFERENCES work_sites (id) ON DELETE SET NULL,
    starts_on       date         NOT NULL,
    ends_on         date,
    status          varchar(20)  NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE','ENDED','CANCELLED')),
    notes           varchar(500),
    created_by      uuid         REFERENCES users (id) ON DELETE SET NULL,
    ended_by        uuid         REFERENCES users (id) ON DELETE SET NULL,
    ended_at        timestamptz,
    cancelled_by    uuid         REFERENCES users (id) ON DELETE SET NULL,
    cancelled_at    timestamptz,
    cancel_reason   varchar(500),
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT ck_contracts_range CHECK (ends_on IS NULL OR ends_on >= starts_on),
    CONSTRAINT ck_contracts_project CHECK (
        (contract_type = 'PROJECT' AND project_id IS NOT NULL)
        OR (contract_type = 'SHIFT' AND project_id IS NULL)),
    CONSTRAINT ck_contracts_cancel CHECK (status <> 'CANCELLED' OR cancel_reason IS NOT NULL),
    CONSTRAINT ex_contracts_no_overlap
        EXCLUDE USING gist (
            user_id WITH =,
            daterange(starts_on, ends_on, '[]') WITH &&
        ) WHERE (status <> 'CANCELLED')
);

CREATE INDEX ix_contracts_tenant_user    ON employment_contracts (tenant_id, user_id, starts_on DESC);
CREATE INDEX ix_contracts_tenant_project ON employment_contracts (tenant_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX ix_contracts_tenant_type    ON employment_contracts (tenant_id, contract_type, status);

CREATE TRIGGER trg_employment_contracts_updated_at BEFORE UPDATE ON employment_contracts
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE employment_contracts IS
    'Contrato del colaborador: PROJECT (asignación a un proyecto, acotada a su vigencia) o SHIFT '
    '(periodo de empleo por turno/horario). Sin traslapes entre contratos no cancelados.';

-- =====================================================================
-- Proyectos: la vigencia debe ser coherente. NOT VALID para no fallar el
-- despliegue si ya hay filas con fechas invertidas; aplica a todo lo nuevo
-- y a cualquier edición de una fila existente.
-- =====================================================================
ALTER TABLE projects
    ADD CONSTRAINT ck_projects_range CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on) NOT VALID;

-- attendance_records.project_id existía sin FK (V6); se poblará en la fase 2.
ALTER TABLE attendance_records
    ADD CONSTRAINT fk_attendance_records_project FOREIGN KEY (project_id)
    REFERENCES projects (id) ON DELETE SET NULL;

-- =====================================================================
-- RBAC
--   contract:manage → registrar, editar, terminar y cancelar contratos
--                     (COMPANY_ADMIN, HR_ADMIN).
-- SUPER_ADMIN no lo recibe: su alcance es de plataforma (V19).
-- =====================================================================
INSERT INTO permissions (code, resource, action, description) VALUES
    ('contract:manage', 'contract', 'manage', 'Registrar y administrar contratos de colaboradores')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.code = 'contract:manage'
WHERE r.code IN ('COMPANY_ADMIN','HR_ADMIN')
ON CONFLICT DO NOTHING;
