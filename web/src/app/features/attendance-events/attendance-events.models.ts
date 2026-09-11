/** Un registro individual de asistencia (espejo de AttendanceEventDto). */
export interface AttendanceEvent {
  recordId: string;
  serverTime: string; // ISO datetime
  userId: string;
  employeeName?: string;
  employeeCode?: string;
  workSite?: string;
  eventType: string;
  status: string;
  rejectionReason?: string | null;
  /** Hay foto asociada. La URL se pide aparte al abrir el detalle porque caduca en minutos. */
  hasEvidence: boolean;
  biometricVerified: boolean;
  gpsAccuracyM?: number | null;
  distanceToSiteM?: number | null;
  source?: string;
  /**
   * Se registró sin centro de trabajo (QR de empresa), luego sin validación de geocerca. No es lo
   * mismo que un centro borrado: aquel también deja `workSite` vacío pero sí pasó por su geocerca.
   */
  siteless: boolean;
}

/** Etiquetas en español de los tipos de evento. */
export const EVENT_LABELS: Record<string, string> = {
  ENTRADA: 'Hora entrada',
  SALIDA: 'Hora salida',
  INICIO_DESCANSO: 'Salida a comida',
  FIN_DESCANSO: 'Regreso de comida',
  CAMBIO_SITIO: 'Cambio de sitio',
};

export const EVENT_OPTIONS = Object.entries(EVENT_LABELS).map(([code, label]) => ({ code, label }));

export const STATUS_LABELS: Record<string, string> = {
  ACCEPTED: 'Aceptado',
  REJECTED: 'Rechazado',
  PENDING_REVIEW: 'En revisión',
};

/** Motivos de rechazo legibles (para el tooltip del estado). */
export const REJECTION_LABELS: Record<string, string> = {
  INVALID_QR: 'QR inválido',
  OUT_OF_GEOFENCE: 'Fuera de la geocerca',
  LOW_GPS_ACCURACY: 'Precisión de GPS baja',
  GPS_UNAVAILABLE: 'GPS no disponible',
  OUT_OF_SCHEDULE: 'Fuera de horario',
  FRAUD_MOCK_LOCATION: 'Ubicación simulada',
  FRAUD_ROOTED_DEVICE: 'Dispositivo comprometido',
  FRAUD_GPS_SPOOF_APP: 'App de suplantación de GPS',
  REPLAY_DETECTED: 'Registro duplicado',
  INVALID_SEQUENCE: 'Secuencia inválida',
  UNTRUSTED_DEVICE: 'Dispositivo no confiable',
  PHOTO_REQUIRED: 'Falta evidencia fotográfica',
  BIOMETRIC_REQUIRED: 'Falta verificación biométrica',
  EVENT_TYPE_DISABLED: 'Tipo de evento deshabilitado',
  SITELESS_NOT_ALLOWED: 'La empresa no permite registrar sin centro de trabajo',
};
