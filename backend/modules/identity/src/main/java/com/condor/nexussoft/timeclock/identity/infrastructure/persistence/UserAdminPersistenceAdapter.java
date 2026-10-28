package com.condor.nexussoft.timeclock.identity.infrastructure.persistence;

import com.condor.nexussoft.timeclock.identity.domain.port.in.UserListFilter;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserView;
import com.condor.nexussoft.timeclock.identity.domain.port.out.UserAdminRepositoryPort;
import com.condor.nexussoft.timeclock.shared.domain.Paged;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Repository;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Repository
public class UserAdminPersistenceAdapter implements UserAdminRepositoryPort {

    /** Permiso que define a un colaborador como "habilitado para registrar accesos" (RN-35). */
    private static final String ATTENDANCE_REGISTER = "attendance:register";

    private final UserJpaRepository users;
    private final RoleJpaRepository roles;

    public UserAdminPersistenceAdapter(UserJpaRepository users, RoleJpaRepository roles) {
        this.users = users;
        this.roles = roles;
    }

    @Override
    public boolean existsByTenantAndEmail(UUID tenantId, String email) {
        return users.existsByTenantIdAndEmail(tenantId, email);
    }

    @Override
    public boolean rolesEnableAttendanceRegister(Set<String> roleCodes) {
        if (roleCodes == null || roleCodes.isEmpty()) {
            return false;
        }
        return resolveRoles(roleCodes).stream()
                .flatMap(role -> role.getPermissions().stream())
                .anyMatch(permission -> ATTENDANCE_REGISTER.equals(permission.getCode()));
    }

    @Override
    public UserView create(UUID tenantId, String email, String passwordHash, String firstName,
                           String lastName, String employeeCode, Set<String> roleCodes) {
        UserJpaEntity entity = new UserJpaEntity(UUID.randomUUID(), tenantId, false, email, passwordHash,
                firstName, lastName, employeeCode, "ACTIVE");
        entity.setRoles(resolveRoles(roleCodes));
        return toView(users.save(entity));
    }

    @Override
    public Optional<UserView> findByIdAndTenant(UUID id, UUID tenantId) {
        return users.findByIdAndTenantId(id, tenantId).map(this::toView);
    }

    @Override
    public Paged<UserView> findAllByTenant(UUID tenantId, int page, int size, UserListFilter filter) {
        PageRequest pageable = PageRequest.of(page, size, Sort.by("email").ascending());
        Page<UserJpaEntity> result = users.findAll(UserSpecifications.matching(tenantId, filter), pageable);
        return new Paged<>(result.map(this::toView).getContent(),
                result.getNumber(), result.getSize(), result.getTotalElements());
    }

    @Override
    public Optional<UserView> updateStatus(UUID id, UUID tenantId, String status) {
        return users.findByIdAndTenantId(id, tenantId).map(entity -> {
            entity.setStatus(status);
            return toView(users.save(entity));
        });
    }

    @Override
    public Optional<UserView> updatePassword(UUID id, UUID tenantId, String newPasswordHash) {
        return users.findByIdAndTenantId(id, tenantId).map(entity -> {
            entity.setPasswordHash(newPasswordHash);
            return toView(users.save(entity));
        });
    }

    @Override
    public Optional<UserView> assignRoles(UUID id, UUID tenantId, Set<String> roleCodes) {
        return users.findByIdAndTenantId(id, tenantId).map(entity -> {
            entity.setRoles(resolveRoles(roleCodes));
            return toView(users.save(entity));
        });
    }

    private Set<RoleJpaEntity> resolveRoles(Set<String> roleCodes) {
        if (roleCodes == null || roleCodes.isEmpty()) {
            return new HashSet<>();
        }
        return new HashSet<>(roles.findByCodeInAndTenantIdIsNull(roleCodes));
    }

    private UserView toView(UserJpaEntity e) {
        List<String> roleCodes = e.getRoles().stream().map(RoleJpaEntity::getCode).toList();
        return new UserView(e.getId(), e.getEmail(), e.getFirstName(), e.getLastName(),
                e.getEmployeeCode(), e.getStatus(), roleCodes);
    }
}
