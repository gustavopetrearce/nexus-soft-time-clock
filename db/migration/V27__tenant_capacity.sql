-- =====================================================================
-- V27 — Capacidad de colaboradores activos por tenant (RF-29)
--
-- Reglas RN-34..RN-37:
--   límite vigente = base_limit + extra_blocks * block_size  (150 + n*50)
--   bloques completos y acumulativos; solo el SUPER_ADMIN los administra.
--
-- Por qué una tabla propia y no company_settings: esa tabla la edita el
-- propio tenant con `company:settings` (V21). El cupo es una decisión
-- comercial de plataforma, así que vive aparte, con su propio permiso y
-- con traza de quién lo cambió. Ver ADR-012.
--
-- Los tres valores se guardan por tenant (no como constantes del código)
-- para que un cambio futuro de la oferta comercial no altere
-- retroactivamente los contratos vigentes (supuesto S-12).
--
-- Convenciones (V1): snake_case, plural/singular por tabla existente,
-- timestamptz UTC, trigger fn_set_updated_at() para updated_at.
-- =====================================================================

-- =====================================================================
-- 1) company_capacity — cupo contratado del tenant
-- =====================================================================
CREATE TABLE company_capacity (
    company_id   uuid        PRIMARY KEY REFERENCES companies (id) ON DELETE CASCADE,
    base_limit   integer     NOT NULL DEFAULT 150 CHECK (base_limit > 0),
    block_size   integer     NOT NULL DEFAULT 50  CHECK (block_size > 0),
    extra_blocks integer     NOT NULL DEFAULT 0   CHECK (extra_blocks >= 0),
    updated_by   uuid        REFERENCES users (id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_company_capacity_updated_at
    BEFORE UPDATE ON company_capacity
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE company_capacity IS
    'Cupo de colaboradores activos del tenant (RF-29, RN-34). Límite vigente = base_limit + extra_blocks * block_size.';
COMMENT ON COLUMN company_capacity.base_limit IS
    'Cupo incluido sin bloques adicionales (150 por defecto). Se guarda por tenant: un cambio comercial futuro no altera los contratos vigentes.';
COMMENT ON COLUMN company_capacity.block_size IS
    'Colaboradores que habilita cada bloque adicional (50 por defecto). Los bloques son completos: no se fraccionan ni se prorratean.';
COMMENT ON COLUMN company_capacity.extra_blocks IS
    'Bloques adicionales contratados. A partir del colaborador 151 se requiere el primero (RN-34).';
COMMENT ON COLUMN company_capacity.updated_by IS
    'Super administrador que cambió el cupo por última vez. El detalle antes/después queda en audit_logs (RN-43).';

-- Toda empresa existente arranca con el cupo base y sin bloques.
INSERT INTO company_capacity (company_id)
SELECT id FROM companies
ON CONFLICT (company_id) DO NOTHING;

-- =====================================================================
-- 2) RBAC — permiso de administración del cupo
--
-- Ojo con el orden histórico: V19 borró de SUPER_ADMIN todo permiso que
-- no fuera `company:manage`, así que aquí hay que concedérselo de forma
-- explícita. Es el patrón inverso al de V20/V21, donde SUPER_ADMIN
-- quedaba fuera a propósito porque eran permisos operativos del tenant.
-- =====================================================================
INSERT INTO permissions (code, resource, action, description) VALUES
    ('company:capacity', 'company', 'capacity',
     'Administrar el cupo de colaboradores activos y los bloques adicionales de un tenant')
ON CONFLICT (code) DO NOTHING;

-- Solo el rol plantilla de plataforma. Ningún rol de tenant lo recibe:
-- el COMPANY_ADMIN consulta el cupo en modo lectura con `user:manage`.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.code = 'company:capacity'
WHERE r.tenant_id IS NULL AND r.code = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;
