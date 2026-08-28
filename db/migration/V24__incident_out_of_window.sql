-- =====================================================================
-- V24 — Incidencia por marca fuera de la ventana del turno (RN-15)
-- =====================================================================
-- La ventana de registro gobierna CUÁNDO se puede abrir la jornada, así que solo rechaza la ENTRADA:
-- rechazar una SALIDA tardía dejaba al colaborador sin poder cerrar, con la jornada abierta hasta que
-- caducara por company_settings.open_shift_max_hours. Los demás eventos pasan a aceptarse fuera de
-- ventana, y RN-15 pide que eso genere una incidencia ("registro fuera de ventana → incidencia …, no
-- necesariamente rechazo").
--
-- Hace falta un tipo nuevo: RETARDO está reservado a la ENTRADA tardía DENTRO de ventana (RN-16), y
-- el resto del catálogo no describe este caso.

ALTER TABLE incidents
    DROP CONSTRAINT IF EXISTS incidents_type_check;

ALTER TABLE incidents
    ADD CONSTRAINT incidents_type_check
    CHECK (type IN ('RETARDO','FALTA','REGISTRO_RECHAZADO','PERMISO',
                    'JUSTIFICACION','FRAUDE','FUERA_DE_VENTANA','OTRO'));

COMMENT ON COLUMN incidents.type IS
    'Tipo de incidencia. FUERA_DE_VENTANA la abre automáticamente una marca aceptada fuera de la '
    'ventana del turno (RN-15); RETARDO, una ENTRADA tardía dentro de ventana (RN-16).';
