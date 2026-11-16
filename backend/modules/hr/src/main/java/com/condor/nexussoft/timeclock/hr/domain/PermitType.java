package com.condor.nexussoft.timeclock.hr.domain;

/** Tipo de permiso: entrada tarde, salida temprano o falta autorizada. */
public enum PermitType {
    /** Llega más tarde de su hora de entrada; un día, con la hora autorizada. */
    LATE_ARRIVAL,
    /** Sale antes de su hora de salida; un día, con la hora autorizada. */
    EARLY_DEPARTURE,
    /** No se presenta; uno o varios días. */
    ABSENCE
}
