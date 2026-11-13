-- =====================================================================
-- V30 — Tipos de descanso configurables por empresa
-- Califican el par INICIO_DESCANSO/FIN_DESCANSO ("Almuerzo", "Comida",
-- "Café"…) sin añadir tipos de evento: la máquina de estados de la
-- jornada (RN-12) y el cálculo de horas siguen viendo un descanso.
-- Sin categorías definidas el comportamiento es el de siempre.
-- =====================================================================

CREATE TABLE attendance_break_types (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid        NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    -- Identificador estable para integraciones (API externa); la etiqueta es libre.
    code         varchar(30) NOT NULL CHECK (code ~ '^[A-Z0-9_]+$'),
    label        varchar(60) NOT NULL,
    enabled      boolean     NOT NULL DEFAULT true,
    -- Descanso pagado: su tramo cuenta como tiempo trabajado en los reportes.
    paid         boolean     NOT NULL DEFAULT false,
    -- Duración máxima orientativa (minutos); nula = sin límite.
    max_minutes  integer     CHECK (max_minutes IS NULL OR max_minutes > 0),
    sort_order   integer     NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_att_break_type_tenant_code
    ON attendance_break_types (tenant_id, code);

COMMENT ON TABLE attendance_break_types IS
    'Categorías de descanso por empresa (almuerzo, comida, café…) que califican INICIO_DESCANSO/FIN_DESCANSO.';

-- Categoría del descanso en la marca: la elige INICIO_DESCANSO y FIN_DESCANSO la hereda.
-- Sin FK: attendance_records está particionada y la categoría solo se desactiva, nunca se
-- borra mientras tenga marcas (lo garantiza la aplicación).
ALTER TABLE attendance_records ADD COLUMN break_type_id uuid;

-- Nuevo motivo de rechazo: categoría de descanso ausente, desconocida o deshabilitada.
ALTER TABLE attendance_records
    DROP CONSTRAINT IF EXISTS attendance_records_rejection_reason_check;

ALTER TABLE attendance_records
    ADD CONSTRAINT attendance_records_rejection_reason_check
    CHECK (rejection_reason IS NULL OR rejection_reason IN (
        'INVALID_QR','OUT_OF_GEOFENCE','LOW_GPS_ACCURACY','GPS_UNAVAILABLE',
        'OUT_OF_SCHEDULE','FRAUD_MOCK_LOCATION','FRAUD_ROOTED_DEVICE',
        'FRAUD_GPS_SPOOF_APP','REPLAY_DETECTED','INVALID_SEQUENCE','UNTRUSTED_DEVICE',
        'PHOTO_REQUIRED','BIOMETRIC_REQUIRED','EVENT_TYPE_DISABLED','SITELESS_NOT_ALLOWED',
        'INVALID_BREAK_TYPE'));
