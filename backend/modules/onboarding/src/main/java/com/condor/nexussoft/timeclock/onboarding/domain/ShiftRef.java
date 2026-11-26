package com.condor.nexussoft.timeclock.onboarding.domain;

import java.util.UUID;

/** Un turno del tenant, identificado en el archivo por código de horario + nombre de turno. */
public record ShiftRef(String scheduleCode, String shiftName, UUID shiftId) {
}
