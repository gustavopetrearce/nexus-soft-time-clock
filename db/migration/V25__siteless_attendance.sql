-- =====================================================================
-- V25 — Marcación sin centro de trabajo (camino opcional a RF-10/RF-15/HU-10)
--
-- Habilita un segundo camino de registro, convivente con el actual, para
-- colaboradores sin sede fija: se escanea un QR de EMPRESA (sin centro), el
-- GPS sigue siendo obligatorio y se persiste, pero NO se contrasta contra
-- ninguna geocerca. La foto pasa a ser obligatoria en ese camino (es la
-- evidencia que sustituye a la geocerca) y el registro queda marcado con la
-- bandera NO_GEOFENCE en validations_json.
--
-- El interruptor es por empresa y viene apagado: ningún tenant existente
-- cambia de comportamiento al aplicar esta migración.
--
-- Convenciones (V1): snake_case, política como columna de company_settings,
-- tenant_id prefijo de índices. El CHECK de rejection_reason se recrea
-- entero siguiendo el patrón de V13/V14.
-- =====================================================================

-- =====================================================================
-- 1) Política por empresa
-- =====================================================================
ALTER TABLE company_settings
    ADD COLUMN siteless_attendance_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN company_settings.siteless_attendance_enabled IS
    'Si true, la empresa puede emitir un QR de empresa y sus colaboradores registrar sin centro '
    '(sin validación de geocerca, con foto obligatoria). Apagado por defecto.';

-- =====================================================================
-- 2) El centro deja de ser obligatorio en el registro
--    ALTER sobre la tabla particionada: se propaga a todas las particiones
--    y no reescribe datos (solo retira la restricción).
-- =====================================================================
ALTER TABLE attendance_records ALTER COLUMN work_site_id DROP NOT NULL;

COMMENT ON COLUMN attendance_records.work_site_id IS
    'Centro donde se registró la marca. NULL = marcación sin centro (QR de empresa, '
    'sin validación de geocerca); en ese caso distance_to_site_m y geofence_id también son NULL.';

-- =====================================================================
-- 3) El QR firmado admite ámbito de empresa (work_site_id NULL)
-- =====================================================================
ALTER TABLE site_qr_tokens ALTER COLUMN work_site_id DROP NOT NULL;

COMMENT ON COLUMN site_qr_tokens.work_site_id IS
    'Centro al que pertenece el QR. NULL = QR de empresa (RF-14, camino sin centro).';

-- Un solo QR de empresa activo por tenant, en espejo de ix_qr_tokens_site_active.
CREATE INDEX ix_qr_tokens_tenant_active
    ON site_qr_tokens (tenant_id) WHERE is_active AND work_site_id IS NULL;

-- =====================================================================
-- 4) Nuevo motivo de rechazo: la empresa no permite el camino sin centro.
--    Es la barrera de uso; el interruptor por sí solo únicamente gobierna
--    la EMISIÓN del QR, no que alguien presente uno emitido antes.
-- =====================================================================
ALTER TABLE attendance_records
    DROP CONSTRAINT IF EXISTS attendance_records_rejection_reason_check;

ALTER TABLE attendance_records
    ADD CONSTRAINT attendance_records_rejection_reason_check
    CHECK (rejection_reason IS NULL OR rejection_reason IN (
        'INVALID_QR','OUT_OF_GEOFENCE','LOW_GPS_ACCURACY','GPS_UNAVAILABLE',
        'OUT_OF_SCHEDULE','FRAUD_MOCK_LOCATION','FRAUD_ROOTED_DEVICE',
        'FRAUD_GPS_SPOOF_APP','REPLAY_DETECTED','INVALID_SEQUENCE','UNTRUSTED_DEVICE',
        'PHOTO_REQUIRED','BIOMETRIC_REQUIRED','EVENT_TYPE_DISABLED','SITELESS_NOT_ALLOWED'));
