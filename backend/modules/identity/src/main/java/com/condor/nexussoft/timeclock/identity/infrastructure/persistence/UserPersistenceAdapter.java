package com.condor.nexussoft.timeclock.identity.infrastructure.persistence;

import com.condor.nexussoft.timeclock.identity.domain.model.*;
import com.condor.nexussoft.timeclock.identity.domain.port.out.UserRepositoryPort;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** Adaptador de salida: traduce entre entidades JPA y el agregado de dominio {@link User}. */
@Repository
public class UserPersistenceAdapter implements UserRepositoryPort {

    private final UserJpaRepository jpa;

    public UserPersistenceAdapter(UserJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public Optional<User> findByTenantAndEmail(UUID tenantId, Email email) {
        return jpa.findByTenantIdAndEmail(tenantId, email.value()).map(this::toDomain);
    }

    @Override
    public Optional<User> findPlatformAdminByEmail(Email email) {
        return jpa.findByPlatformAdminTrueAndEmail(email.value()).map(this::toDomain);
    }

    @Override
    public Optional<User> findById(UUID id) {
        return jpa.findById(id).map(this::toDomain);
    }

    @Override
    public Optional<User> findByTenantAndEmployeeCode(UUID tenantId, String employeeCode) {
        return jpa.findByTenantIdAndEmployeeCode(tenantId, employeeCode).map(this::toDomain);
    }

    @Override
    public void save(User user) {
        // La autenticación solo muta estado de bloqueo/contadores.
        jpa.findById(user.getId()).ifPresent(entity -> {
            entity.setStatus(user.status().name());
            entity.setFailedLoginCount(user.failedLoginCount());
            entity.setLockedUntil(user.lockedUntil());
            jpa.save(entity);
        });
    }

    @Override
    public void updatePasswordHash(UUID userId, String newPasswordHash) {
        jpa.findById(userId).ifPresent(entity -> {
            entity.setPasswordHash(newPasswordHash);
            jpa.save(entity);
        });
    }

    private User toDomain(UserJpaEntity e) {
        Set<Role> roles = e.getRoles().stream()
                .map(r -> new Role(
                        r.getId(),
                        r.getCode(),
                        r.getPermissions().stream()
                                .map(p -> new Permission(p.getCode()))
                                .collect(Collectors.toSet())))
                .collect(Collectors.toSet());

        return new User(
                e.getId(),
                e.getTenantId(),
                e.isPlatformAdmin(),
                Email.of(e.getEmail()),
                e.getPasswordHash(),
                e.getFirstName(),
                e.getLastName(),
                UserStatus.valueOf(e.getStatus()),
                e.getFailedLoginCount(),
                e.getLockedUntil(),
                roles);
    }
}
