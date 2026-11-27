package com.condor.nexussoft.timeclock.hr.domain;

/**
 * Estado del permiso. El registrado por el personal nace APPROVED; la solicitud del colaborador
 * (incapacidad) nace PENDING y pasa a APPROVED o REJECTED. La cancelación (solo de APPROVED) es definitiva.
 */
public enum PermitStatus { PENDING, APPROVED, REJECTED, CANCELLED }
