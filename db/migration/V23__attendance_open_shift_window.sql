-- =====================================================================
-- V23 — Cota temporal de la jornada abierta (RN-12 precisada)
-- =====================================================================
-- La secuencia de eventos (RN-12) se deriva del último evento ACCEPTED del colaborador, pero esa
-- consulta no tenía cota temporal: una ENTRADA sin su SALIDA dejaba la jornada abierta para siempre
-- y toda ENTRADA posterior se rechazaba con INVALID_SEQUENCE, sin forma de desatascarla (work_days
-- no se pobla y no hay job de cierre). A la inversa, una SALIDA de días después se aceptaba y
-- producía una jornada de duración absurda.
--
-- Se acota con una ventana deslizante configurable por empresa. Deslizante y no "día natural"
-- porque un turno nocturno legítimo (shifts.crosses_midnight) cruza la medianoche y un corte por
-- fecha lo partiría en dos. El default de 16 h cubre un turno nocturno más sus ventanas de registro
-- y tolerancias.
--
-- Efecto colateral buscado: attendance_records está particionada por server_time, y acotar la
-- consulta por ese campo permite podar particiones.

ALTER TABLE company_settings
    ADD COLUMN open_shift_max_hours integer NOT NULL DEFAULT 16
               CHECK (open_shift_max_hours > 0);

COMMENT ON COLUMN company_settings.open_shift_max_hours IS
    'Horas durante las que una jornada sin SALIDA sigue considerándose abierta a efectos de la secuencia (RN-12). Pasado ese plazo el colaborador puede volver a registrar ENTRADA y una SALIDA tardía se rechaza como INVALID_SEQUENCE.';
