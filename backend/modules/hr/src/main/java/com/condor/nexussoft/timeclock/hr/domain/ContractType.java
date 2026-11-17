package com.condor.nexussoft.timeclock.hr.domain;

/** Tipo de contrato del colaborador (RF-30). */
public enum ContractType {
    /** Por proyecto: el contrato es la asignación al proyecto y no rebasa su vigencia (RN-64). */
    PROJECT,
    /** Por turno/horario: periodo de empleo; los turnos se asignan dentro de él. */
    SHIFT
}
