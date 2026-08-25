package com.condor.nexussoft.timeclock.attendance.infrastructure.integration;

import com.condor.nexussoft.timeclock.attendance.domain.port.out.QrValidationPort;
import com.condor.nexussoft.timeclock.geofencing.domain.QrPayload;
import com.condor.nexussoft.timeclock.geofencing.domain.port.in.GeofencingUseCase;
import com.condor.nexussoft.timeclock.shared.domain.DomainException;
import org.springframework.stereotype.Component;

/** Puente hacia el BC Geofencing para verificar el QR firmado (RN-25). */
@Component
public class QrValidationAdapter implements QrValidationPort {

    private final GeofencingUseCase geofencing;

    public QrValidationAdapter(GeofencingUseCase geofencing) {
        this.geofencing = geofencing;
    }

    @Override
    public QrCheck verify(String qrToken) {
        try {
            QrPayload p = geofencing.verifyQr(qrToken);
            return new QrCheck(true, false, p.tenantId(), p.workSiteId(), p.nonce());
        } catch (DomainException e) {
            // Ambos casos son INVALID_QR para el núcleo; se distinguen solo para dejar traza de que
            // el QR estaba caducado, que es el fallo típico de un lote offline.
            return "QR_EXPIRED".equals(e.getCode()) ? QrCheck.expiredToken() : QrCheck.invalid();
        }
    }
}
