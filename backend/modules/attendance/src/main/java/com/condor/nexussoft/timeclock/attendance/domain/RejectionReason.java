package com.condor.nexussoft.timeclock.attendance.domain;

/** Motivos de rechazo del registro (RN-10..RN-28). Los nombres coinciden con los códigos de API. */
public enum RejectionReason {
    INVALID_QR,
    OUT_OF_GEOFENCE,
    LOW_GPS_ACCURACY,
    GPS_UNAVAILABLE,
    OUT_OF_SCHEDULE,
    FRAUD_MOCK_LOCATION,
    FRAUD_ROOTED_DEVICE,
    FRAUD_GPS_SPOOF_APP,
    REPLAY_DETECTED,
    INVALID_SEQUENCE,
    UNTRUSTED_DEVICE,
    PHOTO_REQUIRED,
    BIOMETRIC_REQUIRED,
    EVENT_TYPE_DISABLED,
    /** La empresa no admite registrar sin centro de trabajo (V25). */
    SITELESS_NOT_ALLOWED
}
