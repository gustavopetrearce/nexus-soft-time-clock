package com.condor.nexussoft.timeclock.geofencing.domain.port.out;

import java.util.UUID;

/**
 * ¿Tiene la empresa habilitado el registro sin centro de trabajo? Gobierna la emisión del QR de
 * empresa; el uso lo vuelve a comprobar el registro de asistencia (BC-06), porque un interruptor
 * que solo controlase la emisión no impediría presentar un QR emitido antes de apagarlo.
 */
public interface SitelessAttendancePolicyPort {

    boolean isEnabled(UUID tenantId);
}
