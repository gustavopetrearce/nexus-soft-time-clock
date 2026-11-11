-- =====================================================================
-- V29 — Incidencia por ENTRADA sin turno asignado vigente
-- =====================================================================
-- Sin turno vigente no hay ventana (RN-15) ni retardo (RN-16) contra los que medir la marca, así que
-- se acepta. Hasta ahora lo hacía sin dejar rastro: un colaborador recién dado de alta, sin horario,
-- podía fichar entradas y salidas sin que el supervisor lo viera. La ENTRADA abre ahora una
-- incidencia SIN_TURNO (una por jornada, no por marca).

ALTER TABLE incidents
    DROP CONSTRAINT IF EXISTS incidents_type_check;

ALTER TABLE incidents
    ADD CONSTRAINT incidents_type_check
    CHECK (type IN ('RETARDO','FALTA','REGISTRO_RECHAZADO','PERMISO',
                    'JUSTIFICACION','FRAUDE','FUERA_DE_VENTANA','SIN_TURNO','OTRO'));

COMMENT ON COLUMN incidents.type IS
    'Tipo de incidencia. FUERA_DE_VENTANA la abre automáticamente una marca aceptada fuera de la '
    'ventana del turno (RN-15); RETARDO, una ENTRADA tardía dentro de ventana (RN-16); SIN_TURNO, una '
    'ENTRADA aceptada sin turno asignado vigente.';
