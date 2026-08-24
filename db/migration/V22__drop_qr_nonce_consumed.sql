-- =====================================================================
-- V22 — Se retira el consumo de nonce del QR de centro (RN-26 revisada)
-- =====================================================================
-- El QR de centro lleva un único nonce fijo durante toda su vigencia (días/semanas/meses), así que
-- "consumirlo" convertía la barrera en «un solo registro por persona y día»: tras la ENTRADA, el
-- INICIO_DESCANSO del mismo día chocaba contra uq_qr_nonce_consumed y se rechazaba como
-- REPLAY_DETECTED. Afinar la clave con event_type tampoco sirve: RN-12 admite varios descansos y
-- varios CAMBIO_SITIO en la misma jornada.
--
-- El anti-replay real pasa a ser: idempotencia por operation_uuid (RN-51) + secuencia coherente
-- (RN-12) + geocerca, antifraude y device binding. El nonce queda como traza de auditoría en el
-- propio registro de asistencia.

ALTER TABLE attendance_records ADD COLUMN qr_nonce varchar(64);

COMMENT ON COLUMN attendance_records.qr_nonce IS
    'Nonce del QR usado en el registro (traza de auditoría, RN-26). No impone unicidad: el mismo QR sirve para todos los eventos de la jornada.';

DROP TABLE qr_nonce_consumed;
