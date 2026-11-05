-- =====================================================================
-- V28 — Credenciales de sistema y marcación externa (ADR-013)
--
-- Un sistema corporativo se autentica con client_id/client_secret y registra
-- marcaciones en nombre de los colaboradores de SU empresa. No es un usuario:
-- no ocupa cupo (RN-34), no tiene contraseña y no recibe refresh token.
--
-- La marca externa no trae GPS: quien la envía ya autenticó a la persona. Por
-- eso location/gps_accuracy_m dejan de ser obligatorias, con el mismo patrón
-- de ALTER sobre tabla particionada que V25.
--
-- Convenciones (V1): snake_case, timestamptz UTC, trigger fn_set_updated_at().
-- =====================================================================

-- =====================================================================
-- 1) api_clients — credenciales por empresa
-- =====================================================================
CREATE TABLE api_clients (
    id           uuid         PRIMARY KEY,
    tenant_id    uuid         NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    client_id    varchar(64)  NOT NULL,
    secret_hash  varchar(128) NOT NULL,
    name         varchar(120) NOT NULL,
    status       varchar(20)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
    last_used_at timestamptz,
    created_by   uuid         REFERENCES users (id) ON DELETE SET NULL,
    revoked_at   timestamptz,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now()
);

-- Global: el client_id es lo único que llega al pedir token, y de él sale el tenant.
CREATE UNIQUE INDEX uq_api_clients_client_id   ON api_clients (client_id);
CREATE UNIQUE INDEX uq_api_clients_tenant_name ON api_clients (tenant_id, name);

CREATE TRIGGER trg_api_clients_updated_at
    BEFORE UPDATE ON api_clients
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE api_clients IS
    'Credenciales de sistemas externos (client_credentials) por empresa. Ver ADR-013.';
COMMENT ON COLUMN api_clients.secret_hash IS
    'SHA-256 del secreto. El secreto es aleatorio de 256 bits y solo se muestra al crearlo o rotarlo.';

-- =====================================================================
-- 2) RBAC — administración de credenciales
--    Patrón de V21 (plantilla + roles ya instanciados). No se asigna a
--    SUPER_ADMIN: V19 lo limita a plataforma. El permiso que usa el token
--    del cliente (attendance:register:external) NO entra en el catálogo, a
--    propósito: así ningún rol de usuario puede llegar a recibirlo.
-- =====================================================================
INSERT INTO permissions (code, resource, action, description) VALUES
    ('integration:manage', 'integration', 'manage', 'Administrar credenciales de sistemas externos')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.code = 'integration:manage'
WHERE r.tenant_id IS NULL AND r.code = 'COMPANY_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.code = 'integration:manage'
WHERE r.tenant_id IS NOT NULL AND r.code = 'COMPANY_ADMIN'
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 3) attendance_records — marca sin GPS y nueva procedencia
-- =====================================================================
ALTER TABLE attendance_records ALTER COLUMN location DROP NOT NULL;
ALTER TABLE attendance_records ALTER COLUMN gps_accuracy_m DROP NOT NULL;

ALTER TABLE attendance_records
    DROP CONSTRAINT attendance_records_source_check;

ALTER TABLE attendance_records
    ADD CONSTRAINT attendance_records_source_check
    CHECK (source IN ('ONLINE','OFFLINE_SYNC','EXTERNAL'));

COMMENT ON COLUMN attendance_records.location IS
    'Posición de la marca. NULL = marca de un sistema externo (source = EXTERNAL), que no aporta GPS.';
COMMENT ON COLUMN attendance_records.server_time IS
    'Hora oficial (RN-11). Excepción ADR-013: con source = EXTERNAL es la hora del evento declarada '
    'por el sistema, acotada; la hora de llegada queda en created_at.';
