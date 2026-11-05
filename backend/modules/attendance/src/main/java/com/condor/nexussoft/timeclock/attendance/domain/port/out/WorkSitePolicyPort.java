package com.condor.nexussoft.timeclock.attendance.domain.port.out;

import java.util.UUID;

/** Política de registro definida por centro de trabajo (umbral de precisión, foto y biometría). */
public interface WorkSitePolicyPort {

    SitePolicy find(UUID tenantId, UUID workSiteId);

    /** El centro existe en este tenant y está activo. */
    boolean isActive(UUID tenantId, UUID workSiteId);

    /**
     * @param gpsAccuracyMaxM   umbral de precisión GPS por-centro; {@code null} → usar el default de plataforma.
     * @param requirePhoto      el centro exige evidencia fotográfica (HU-13 CA1).
     * @param requireBiometric  el centro exige verificación biométrica (HU-14 CA1).
     */
    record SitePolicy(Integer gpsAccuracyMaxM, boolean requirePhoto, boolean requireBiometric) {

        /** Política sin exigencias (centro no encontrado o sin configurar). */
        public static SitePolicy permissive() {
            return new SitePolicy(null, false, false);
        }
    }
}
