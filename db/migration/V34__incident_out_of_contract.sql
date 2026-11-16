-- =====================================================================
-- V34 — Incidencia por ENTRADA fuera de la vigencia del contrato (iteración 14, fase 2)
-- =====================================================================
-- Un colaborador con contrato por proyecto (V33) que ficha fuera de la vigencia de su contrato o
-- del proyecto, o con el proyecto no activo, NO se rechaza: un dato administrativo atrasado no debe
-- impedir que alguien que está trabajando fiche (RN-66). La marca se acepta con la bandera
-- OUT_OF_CONTRACT y la ENTRADA abre una incidencia FUERA_DE_VIGENCIA (una por jornada).
--
-- La marca se atribuye al proyecto del contrato en attendance_records.project_id (RN-67), cuya FK
-- se creó en V33.

ALTER TABLE incidents
    DROP CONSTRAINT IF EXISTS incidents_type_check;

ALTER TABLE incidents
    ADD CONSTRAINT incidents_type_check
    CHECK (type IN ('RETARDO','FALTA','REGISTRO_RECHAZADO','PERMISO',
                    'JUSTIFICACION','FRAUDE','FUERA_DE_VENTANA','SIN_TURNO','FUERA_DE_VIGENCIA','OTRO'));

COMMENT ON COLUMN incidents.type IS
    'Tipo de incidencia. FUERA_DE_VENTANA la abre automáticamente una marca aceptada fuera de la '
    'ventana del turno (RN-15); RETARDO, una ENTRADA tardía dentro de ventana (RN-16); SIN_TURNO, una '
    'ENTRADA aceptada sin turno asignado vigente; FUERA_DE_VIGENCIA, una ENTRADA aceptada fuera de la '
    'vigencia de un contrato por proyecto (RN-66).';
