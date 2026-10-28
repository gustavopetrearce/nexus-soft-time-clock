package com.condor.nexussoft.timeclock.identity.domain.port.out;

import com.condor.nexussoft.timeclock.identity.domain.port.in.UserListFilter;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserView;
import com.condor.nexussoft.timeclock.shared.domain.Paged;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/** Puerto de salida para operaciones administrativas de usuarios (CRUD + roles). */
public interface UserAdminRepositoryPort {

    boolean existsByTenantAndEmail(UUID tenantId, String email);

    /**
     * ¿Alguno de esos roles habilita a registrar accesos, es decir, incluye el permiso
     * {@code attendance:register}? Se consulta por <b>permiso efectivo</b> y no comparando contra
     * el código {@code EMPLOYEE}: hoy son equivalentes, pero un rol nuevo con ese permiso también
     * debe consumir cupo (RN-35).
     */
    boolean rolesEnableAttendanceRegister(Set<String> roleCodes);

    UserView create(UUID tenantId, String email, String passwordHash, String firstName,
                    String lastName, String employeeCode, Set<String> roleCodes);

    Optional<UserView> findByIdAndTenant(UUID id, UUID tenantId);

    Paged<UserView> findAllByTenant(UUID tenantId, int page, int size, UserListFilter filter);

    Optional<UserView> updateStatus(UUID id, UUID tenantId, String status);

    Optional<UserView> updatePassword(UUID id, UUID tenantId, String newPasswordHash);

    Optional<UserView> assignRoles(UUID id, UUID tenantId, Set<String> roleCodes);
}
