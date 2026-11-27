-- =====================================================================
-- V39 — Sanciones a colaboradores
--
-- RR. HH., supervisores o el administrador (sanction:manage) ABREN una
-- sanción a un colaborador; nace vigente (ACTIVE) y puede anularse con
-- motivo (VOIDED, definitivo). El colaborador ve las suyas en la app
-- (solo lectura).
--
--   type    VERBAL_WARNING        — amonestación verbal
--           WRITTEN_WARNING       — amonestación por escrito
--           ADMINISTRATIVE_RECORD — acta administrativa
--           SUSPENSION            — suspensión (suspension_start + suspension_days)
--   reason  lista fija: TARDINESS, UNJUSTIFIED_ABSENCE, MISCONDUCT,
--           POLICY_VIOLATION, NEGLIGENCE, OTHER
--
-- Por ahora la suspensión no reclasifica el reporte de asistencia.
-- =====================================================================

CREATE TABLE sanctions (
    id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid          NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    user_id           uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,   -- colaborador
    type              varchar(30)   NOT NULL
                      CHECK (type IN ('VERBAL_WARNING','WRITTEN_WARNING','ADMINISTRATIVE_RECORD','SUSPENSION')),
    reason            varchar(30)   NOT NULL
                      CHECK (reason IN ('TARDINESS','UNJUSTIFIED_ABSENCE','MISCONDUCT','POLICY_VIOLATION',
                                        'NEGLIGENCE','OTHER')),
    incident_date     date          NOT NULL,                -- fecha de los hechos
    description       varchar(1000) NOT NULL CHECK (length(btrim(description)) > 0),
    suspension_start  date,
    suspension_days   integer,
    status            varchar(20)   NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOIDED')),
    issued_by         uuid          REFERENCES users (id) ON DELETE SET NULL,
    voided_by         uuid          REFERENCES users (id) ON DELETE SET NULL,
    voided_at         timestamptz,
    void_reason       varchar(500),
    created_at        timestamptz   NOT NULL DEFAULT now(),
    updated_at        timestamptz   NOT NULL DEFAULT now(),
    -- La suspensión lleva inicio y días; las demás, ninguno.
    CONSTRAINT ck_sanctions_suspension CHECK (
        (type = 'SUSPENSION' AND suspension_start IS NOT NULL AND suspension_days >= 1)
        OR (type <> 'SUSPENSION' AND suspension_start IS NULL AND suspension_days IS NULL)),
    -- Anulada siempre con su motivo.
    CONSTRAINT ck_sanctions_void CHECK (
        status <> 'VOIDED' OR (voided_at IS NOT NULL AND void_reason IS NOT NULL))
);

CREATE INDEX ix_sanctions_tenant_date ON sanctions (tenant_id, incident_date DESC);
CREATE INDEX ix_sanctions_tenant_user ON sanctions (tenant_id, user_id, incident_date DESC);

CREATE TRIGGER trg_sanctions_updated_at BEFORE UPDATE ON sanctions
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE sanctions IS
    'Sanciones a colaboradores (amonestación, acta, suspensión). Las abre RR. HH./supervisión (sanction:manage).';

-- =====================================================================
-- RBAC: sanction:manage → COMPANY_ADMIN, HR_ADMIN, SUPERVISOR.
-- SUPER_ADMIN no lo recibe: su alcance es de plataforma (V19).
-- =====================================================================
INSERT INTO permissions (code, resource, action, description) VALUES
    ('sanction:manage', 'sanction', 'manage', 'Abrir, ver y anular sanciones de colaboradores')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.code = 'sanction:manage'
WHERE r.code IN ('COMPANY_ADMIN','HR_ADMIN','SUPERVISOR')
ON CONFLICT DO NOTHING;
