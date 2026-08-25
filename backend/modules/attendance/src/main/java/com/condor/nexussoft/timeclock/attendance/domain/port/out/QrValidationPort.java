package com.condor.nexussoft.timeclock.attendance.domain.port.out;

import java.util.UUID;

/** Verifica el QR firmado del centro (delegado al BC Geofencing). */
public interface QrValidationPort {

    record QrCheck(boolean valid, boolean expired, UUID tenantId, UUID workSiteId, String nonce) {

        /** Firma inválida, alterada o token ilegible. */
        public static QrCheck invalid() {
            return new QrCheck(false, false, null, null, null);
        }

        /** Firma correcta pero fuera de vigencia: mismo rechazo, distinta causa a efectos de traza. */
        public static QrCheck expiredToken() {
            return new QrCheck(false, true, null, null, null);
        }
    }

    QrCheck verify(String qrToken);
}
