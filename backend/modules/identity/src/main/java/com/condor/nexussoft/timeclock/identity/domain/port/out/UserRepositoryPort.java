package com.condor.nexussoft.timeclock.identity.domain.port.out;

import com.condor.nexussoft.timeclock.identity.domain.model.Email;
import com.condor.nexussoft.timeclock.identity.domain.model.User;

import java.util.Optional;
import java.util.UUID;

/** Puerto de salida hacia la persistencia de usuarios (con sus roles/permisos). */
public interface UserRepositoryPort {

    Optional<User> findByTenantAndEmail(UUID tenantId, Email email);

    Optional<User> findPlatformAdminByEmail(Email email);

    Optional<User> findById(UUID id);

    Optional<User> findByTenantAndEmployeeCode(UUID tenantId, String employeeCode);

    void save(User user);

    /** Actualiza solo el hash de contraseña (el {@link #save} general no toca credenciales). */
    void updatePasswordHash(UUID userId, String newPasswordHash);
}
