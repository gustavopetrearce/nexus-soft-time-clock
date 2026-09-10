/** Acción ante un dispositivo no reconocido (RF-28). */
export type DeviceBindingAction = 'REJECT' | 'FLAG';

/**
 * Políticas por defecto de la empresa (espejo de CompanySettingsDto). Los centros de trabajo
 * pueden sobrescribir foto, biometría y precisión GPS; cuando dejan el valor en «Heredar»,
 * rige lo definido aquí.
 */
export interface CompanyPolicy {
  defaultGpsAccuracyMaxM: number | null;
  requirePhoto: boolean;
  requireBiometric: boolean;
  deviceBindingEnabled: boolean;
  deviceBindingAction: DeviceBindingAction;
  /**
   * Habilita el camino de registro sin centro de trabajo: QR de empresa, sin validación de
   * geocerca y con foto obligatoria (aunque `requirePhoto` esté desactivado).
   */
  sitelessAttendanceEnabled: boolean;
}
