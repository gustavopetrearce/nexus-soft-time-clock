package com.condor.nexussoft.timeclock.attendance.domain.port.in;

import java.time.Instant;
import java.util.UUID;

/**
 * Marcación enviada por un sistema externo en nombre de un colaborador (ADR-013). El sistema ya
 * autenticó a la persona, así que no hay QR, GPS, dispositivo, foto ni biometría que validar.
 */
public interface RegisterExternalAttendanceUseCase {

    /** {@code breakTypeCode}: código de la categoría de descanso (V30), opcional aunque la empresa las use. */
    record ExternalAttendanceCommand(UUID operationUuid, String employeeCode, UUID workSiteId,
                                     String eventType, Instant eventTime, String breakTypeCode) {
        public ExternalAttendanceCommand(UUID operationUuid, String employeeCode, UUID workSiteId,
                                         String eventType, Instant eventTime) {
            this(operationUuid, employeeCode, workSiteId, eventType, eventTime, null);
        }
    }

    AttendanceResult register(UUID tenantId, UUID apiClientId, ExternalAttendanceCommand command);
}
