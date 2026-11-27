-- =====================================================================
-- V38 — Reglas de descanso por turno y uso único por día
--
-- 1) Cada turno puede RESTRINGIR qué categorías de descanso (V30) admite:
--      shifts.breaks_restricted = false → admite todas (comportamiento previo;
--                                          así quedan los turnos existentes)
--      shifts.breaks_restricted = true  → solo las de shift_break_types;
--                                          sin ninguna = turno sin descansos
--    Ej.: nocturno sin descansos, matutino almuerzo y comida, vespertino
--    solo comida. El turno que manda es el de la ENTRADA que abrió la jornada.
--
-- 2) Cada categoría se usa UNA vez por día: el día es la fecha local de la
--    ENTRADA de la jornada (un nocturno pertenece al día en que empezó) y
--    cuenta en todas las jornadas que empiezan esa fecha, para que salir y
--    volver a entrar no permita repetir el almuerzo. Se aplica en la API
--    (rechazo BREAK_ALREADY_USED / BREAK_NOT_ALLOWED_FOR_SHIFT).
-- =====================================================================

ALTER TABLE shifts
    ADD COLUMN breaks_restricted boolean NOT NULL DEFAULT false;

CREATE TABLE shift_break_types (
    shift_id       uuid NOT NULL REFERENCES shifts (id) ON DELETE CASCADE,
    break_type_id  uuid NOT NULL REFERENCES attendance_break_types (id) ON DELETE CASCADE,
    tenant_id      uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    PRIMARY KEY (shift_id, break_type_id)
);

CREATE INDEX ix_shift_break_types_tenant ON shift_break_types (tenant_id);

COMMENT ON TABLE shift_break_types IS
    'Categorías de descanso que admite un turno con breaks_restricted = true (V38).';

-- La búsqueda de los descansos del día usa ix_att_tenant_user_time (V6).

-- Nuevos motivos de rechazo.
ALTER TABLE attendance_records
    DROP CONSTRAINT IF EXISTS attendance_records_rejection_reason_check;

ALTER TABLE attendance_records
    ADD CONSTRAINT attendance_records_rejection_reason_check
    CHECK (rejection_reason IS NULL OR rejection_reason IN (
        'INVALID_QR','OUT_OF_GEOFENCE','LOW_GPS_ACCURACY','GPS_UNAVAILABLE',
        'OUT_OF_SCHEDULE','FRAUD_MOCK_LOCATION','FRAUD_ROOTED_DEVICE',
        'FRAUD_GPS_SPOOF_APP','REPLAY_DETECTED','INVALID_SEQUENCE','UNTRUSTED_DEVICE',
        'PHOTO_REQUIRED','BIOMETRIC_REQUIRED','EVENT_TYPE_DISABLED','SITELESS_NOT_ALLOWED',
        'INVALID_BREAK_TYPE','BREAK_ALREADY_USED','BREAK_NOT_ALLOWED_FOR_SHIFT'));
