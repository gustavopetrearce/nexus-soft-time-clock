package com.condor.nexussoft.timeclock.tenancy.domain;

import com.condor.nexussoft.timeclock.shared.domain.DomainException;

import java.util.UUID;

/**
 * Políticas por defecto de la empresa. Los centros de trabajo pueden sobrescribir la foto, la
 * biometría y la precisión GPS; cuando no lo hacen (columna a NULL), rige lo definido aquí.
 *
 * <p>Solo se modelan las políticas que el motor de registro consulta realmente por tenant. Otras
 * columnas de {@code company_settings} las lee la plataforma desde configuración, no desde la
 * fila del tenant, y exponerlas daría la falsa impresión de que cambiarlas surte efecto.
 */
public record CompanySettings(
        UUID companyId,
        Integer defaultGpsAccuracyMaxM,
        boolean requirePhoto,
        boolean requireBiometric,
        boolean deviceBindingEnabled,
        DeviceBindingAction deviceBindingAction,
        boolean sitelessAttendanceEnabled) {

    private static final int MIN_ACCURACY_M = 5;
    private static final int MAX_ACCURACY_M = 500;

    public enum DeviceBindingAction {
        /** Bloquea el registro desde un dispositivo no reconocido. */
        REJECT,
        /** Permite el registro pero lo marca para revisión. */
        FLAG
    }

    public CompanySettings {
        if (defaultGpsAccuracyMaxM != null
                && (defaultGpsAccuracyMaxM < MIN_ACCURACY_M || defaultGpsAccuracyMaxM > MAX_ACCURACY_M)) {
            throw new DomainException("INVALID_GPS_ACCURACY",
                    "La precisión GPS debe estar entre " + MIN_ACCURACY_M + " y " + MAX_ACCURACY_M + " metros.");
        }
    }

    public static DeviceBindingAction parseAction(String raw) {
        if (raw == null || raw.isBlank()) {
            return DeviceBindingAction.REJECT;
        }
        try {
            return DeviceBindingAction.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new DomainException("INVALID_DEVICE_BINDING_ACTION",
                    "Acción de validación de dispositivo no válida: " + raw);
        }
    }
}
