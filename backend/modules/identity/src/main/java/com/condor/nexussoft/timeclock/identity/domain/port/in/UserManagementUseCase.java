package com.condor.nexussoft.timeclock.identity.domain.port.in;

import com.condor.nexussoft.timeclock.shared.domain.Paged;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Administración de usuarios dentro de un tenant (RF-06, RF-22). */
public interface UserManagementUseCase {

    UserView create(UUID tenantId, GranterAuthority granter, UserCommands.CreateUserCommand command);

    /**
     * Alta en lote (importación masiva): mismas reglas que {@link #create} por cada usuario, en la
     * transacción del llamador. Las contraseñas se cifran en paralelo antes de escribir, porque
     * BCrypt es lo que domina el tiempo de un lote grande. Devuelve las vistas en el mismo orden.
     */
    List<UserView> createAll(UUID tenantId, GranterAuthority granter, List<UserCommands.CreateUserCommand> commands);

    UserView get(UUID tenantId, UUID userId);

    Paged<UserView> list(UUID tenantId, int page, int size, UserListFilter filter);

    UserView updateStatus(UUID tenantId, UUID userId, String status);

    /** Restablece la contraseña de un usuario del tenant (operación administrativa). */
    UserView resetPassword(UUID tenantId, UUID userId, String newPassword);

    UserView assignRoles(UUID tenantId, GranterAuthority granter, UUID userId, Set<String> roleCodes);
}
