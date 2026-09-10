package com.condor.nexussoft.timeclock.tenancy.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.DynamicInsert;

import java.util.UUID;

/**
 * Configuración y políticas por defecto del tenant (migraciones V1 y V20).
 *
 * <p>Solo se mapean las columnas que el portal administra; el resto sigue gobernado por los
 * valores por defecto de la BD. Los campos llevan inicializadores <b>iguales</b> a esos defaults
 * y la entidad es {@code @DynamicInsert} para que el alta de una empresa —que inserta con solo la
 * clave— no escriba ceros y falsos por encima de ellos.
 */
@Entity
@Table(name = "company_settings")
@DynamicInsert
public class CompanySettingsJpaEntity {

    @Id
    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "default_gps_accuracy_max_m")
    private Integer defaultGpsAccuracyMaxM = 50;

    @Column(name = "require_photo")
    private boolean requirePhoto = false;

    @Column(name = "require_biometric")
    private boolean requireBiometric = false;

    @Column(name = "device_binding_enabled")
    private boolean deviceBindingEnabled = true;

    @Column(name = "device_binding_action")
    private String deviceBindingAction = "REJECT";

    @Column(name = "siteless_attendance_enabled")
    private boolean sitelessAttendanceEnabled = false;

    protected CompanySettingsJpaEntity() {
    }

    public CompanySettingsJpaEntity(UUID companyId) {
        this.companyId = companyId;
    }

    public UUID getCompanyId() {
        return companyId;
    }

    public Integer getDefaultGpsAccuracyMaxM() {
        return defaultGpsAccuracyMaxM;
    }

    public boolean isRequirePhoto() {
        return requirePhoto;
    }

    public boolean isRequireBiometric() {
        return requireBiometric;
    }

    public boolean isDeviceBindingEnabled() {
        return deviceBindingEnabled;
    }

    public String getDeviceBindingAction() {
        return deviceBindingAction;
    }

    public void setDefaultGpsAccuracyMaxM(Integer v) {
        this.defaultGpsAccuracyMaxM = v;
    }

    public void setRequirePhoto(boolean v) {
        this.requirePhoto = v;
    }

    public void setRequireBiometric(boolean v) {
        this.requireBiometric = v;
    }

    public void setDeviceBindingEnabled(boolean v) {
        this.deviceBindingEnabled = v;
    }

    public void setDeviceBindingAction(String v) {
        this.deviceBindingAction = v;
    }

    public boolean isSitelessAttendanceEnabled() {
        return sitelessAttendanceEnabled;
    }

    public void setSitelessAttendanceEnabled(boolean v) {
        this.sitelessAttendanceEnabled = v;
    }
}
