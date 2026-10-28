package com.condor.nexussoft.timeclock.identity.domain.port.in;

import com.condor.nexussoft.timeclock.shared.domain.Paged;

import java.util.Set;
import java.util.UUID;

/** Administración de usuarios dentro de un tenant (RF-06, RF-22). */
public interface UserManagementUseCase {

    UserView create(UUID tenantId, GranterAuthority granter, UserCommands.CreateUserCommand command);

    UserView get(UUID tenantId, UUID userId);

    Paged<UserView> list(UUID tenantId, int page, int size, UserListFilter filter);

    UserView updateStatus(UUID tenantId, UUID userId, String status);

    /** Restablece la contraseña de un usuario del tenant (operación administrativa). */
    UserView resetPassword(UUID tenantId, UUID userId, String newPassword);

    UserView assignRoles(UUID tenantId, GranterAuthority granter, UUID userId, Set<String> roleCodes);
}
