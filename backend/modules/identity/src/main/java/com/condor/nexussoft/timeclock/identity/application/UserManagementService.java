package com.condor.nexussoft.timeclock.identity.application;

import com.condor.nexussoft.timeclock.identity.domain.model.CollaboratorCapacityPolicy;
import com.condor.nexussoft.timeclock.identity.domain.model.Email;
import com.condor.nexussoft.timeclock.identity.domain.model.RoleGrantPolicy;
import com.condor.nexussoft.timeclock.identity.domain.port.in.GranterAuthority;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserCommands;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserListFilter;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserManagementUseCase;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserView;
import com.condor.nexussoft.timeclock.identity.domain.port.out.PasswordHasherPort;
import com.condor.nexussoft.timeclock.identity.domain.port.out.RefreshTokenStorePort;
import com.condor.nexussoft.timeclock.identity.domain.port.out.TenantCapacityPort;
import com.condor.nexussoft.timeclock.identity.domain.port.out.UserAdminRepositoryPort;
import com.condor.nexussoft.timeclock.shared.domain.DomainException;
import com.condor.nexussoft.timeclock.shared.domain.Paged;
import com.condor.nexussoft.timeclock.shared.domain.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;
import java.util.UUID;

@Service
public class UserManagementService implements UserManagementUseCase {

    /** Estado con el que nace todo usuario creado desde el portal (ver UserAdminPersistenceAdapter). */
    private static final String ESTADO_INICIAL = "ACTIVE";

    private final UserAdminRepositoryPort users;
    private final PasswordHasherPort passwordHasher;
    private final RefreshTokenStorePort refreshTokens;
    private final TenantCapacityPort capacity;

    public UserManagementService(UserAdminRepositoryPort users, PasswordHasherPort passwordHasher,
                                 RefreshTokenStorePort refreshTokens, TenantCapacityPort capacity) {
        this.users = users;
        this.passwordHasher = passwordHasher;
        this.refreshTokens = refreshTokens;
        this.capacity = capacity;
    }

    @Override
    @Transactional
    public UserView create(UUID tenantId, GranterAuthority granter, UserCommands.CreateUserCommand command) {
        String email = Email.of(command.email()).value();
        if (users.existsByTenantAndEmail(tenantId, email)) {
            throw new DomainException("DUPLICATE_EMAIL", "Ya existe un usuario con el correo " + email);
        }
        Set<String> roles = command.roleCodes() == null ? Set.of() : command.roleCodes();
        RoleGrantPolicy.assertCanGrant(granter.platformAdmin(), granter.roleCodes(), roles);
        requireCapacityIfNeeded(tenantId, null, false, ESTADO_INICIAL, roles);
        String passwordHash = passwordHasher.hash(command.password());
        return users.create(tenantId, email, passwordHash, command.firstName(),
                command.lastName(), command.employeeCode(), roles);
    }

    @Override
    @Transactional(readOnly = true)
    public UserView get(UUID tenantId, UUID userId) {
        return users.findByIdAndTenant(userId, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", userId));
    }

    @Override
    @Transactional(readOnly = true)
    public Paged<UserView> list(UUID tenantId, int page, int size, UserListFilter filter) {
        return users.findAllByTenant(tenantId, page, size, filter == null ? UserListFilter.none() : filter);
    }

    @Override
    @Transactional
    public UserView updateStatus(UUID tenantId, UUID userId, String status) {
        UserView actual = users.findByIdAndTenant(userId, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", userId));
        Set<String> roles = Set.copyOf(actual.roles());
        // Reactivar a un colaborador vuelve a ocupar un asiento: pasa por el cupo igual que un alta.
        requireCapacityIfNeeded(tenantId, actual.status(), roles, status, roles);

        UserView updated = users.updateStatus(userId, tenantId, status)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", userId));

        if (CollaboratorCapacityPolicy.mustRevokeSessions(status)) {
            // La baja libera cupo de inmediato (RN-35), así que la sesión viva tiene que caer con
            // ella: de lo contrario el usuario dado de baja seguiría renovando su refresh —y
            // registrando asistencia— mientras su asiento ya se reasignó (RN-36).
            refreshTokens.revokeAllForUser(userId);
        }
        return updated;
    }

    @Override
    @Transactional
    public UserView resetPassword(UUID tenantId, UUID userId, String newPassword) {
        String passwordHash = passwordHasher.hash(newPassword);
        UserView view = users.updatePassword(userId, tenantId, passwordHash)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", userId));
        // Cierra las sesiones activas del usuario afectado: la contraseña anterior ya no vale.
        refreshTokens.revokeAllForUser(userId);
        return view;
    }

    @Override
    @Transactional
    public UserView assignRoles(UUID tenantId, GranterAuthority granter, UUID userId, Set<String> roleCodes) {
        RoleGrantPolicy.assertCanGrant(granter.platformAdmin(), granter.roleCodes(), roleCodes);
        UserView actual = users.findByIdAndTenant(userId, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", userId));
        // Dar un rol que permite registrar accesos convierte una cuenta de portal en colaborador
        // activo: es la tercera puerta del cupo, junto al alta y la reactivación (RN-37).
        requireCapacityIfNeeded(tenantId, actual.status(), Set.copyOf(actual.roles()),
                actual.status(), roleCodes);
        return users.assignRoles(userId, tenantId, roleCodes)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario", userId));
    }

    private void requireCapacityIfNeeded(UUID tenantId, String currentStatus, Set<String> currentRoles,
                                         String targetStatus, Set<String> targetRoles) {
        requireCapacityIfNeeded(tenantId, currentStatus,
                users.rolesEnableAttendanceRegister(currentRoles), targetStatus, targetRoles);
    }

    private void requireCapacityIfNeeded(UUID tenantId, String currentStatus, boolean registersNow,
                                         String targetStatus, Set<String> targetRoles) {
        boolean registersAfter = users.rolesEnableAttendanceRegister(targetRoles);
        if (CollaboratorCapacityPolicy.needsSlot(currentStatus, registersNow, targetStatus, registersAfter)) {
            capacity.requireSlotForNewCollaborator(tenantId);
        }
    }
}
