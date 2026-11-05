package com.condor.nexussoft.timeclock.identity.application;

import com.condor.nexussoft.timeclock.identity.domain.model.User;
import com.condor.nexussoft.timeclock.identity.domain.model.UserStatus;
import com.condor.nexussoft.timeclock.identity.domain.port.in.CollaboratorDirectoryUseCase;
import com.condor.nexussoft.timeclock.identity.domain.port.out.UserRepositoryPort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Service
public class CollaboratorDirectoryService implements CollaboratorDirectoryUseCase {

    private static final String ATTENDANCE_REGISTER = "attendance:register";

    private final UserRepositoryPort users;

    public CollaboratorDirectoryService(UserRepositoryPort users) {
        this.users = users;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Collaborator> findByEmployeeCode(UUID tenantId, String employeeCode) {
        return users.findByTenantAndEmployeeCode(tenantId, employeeCode)
                .map(user -> new Collaborator(user.getId(), user.firstName(), user.lastName(),
                        user.status().name(), eligibility(user)));
    }

    private Eligibility eligibility(User user) {
        if (!isEmployed(user)) {
            return Eligibility.INACTIVE;
        }
        return user.permissionCodes().contains(ATTENDANCE_REGISTER) ? Eligibility.ELIGIBLE : Eligibility.NOT_ENABLED;
    }

    /**
     * No se usa {@code canAuthenticate}: un bloqueo por contraseñas fallidas (LOCKED con
     * {@code lockedUntil}) impide entrar a la app, pero esta marca no depende de su contraseña.
     * Un LOCKED sin fecha lo puso un administrador a mano, y ese sí corta la marcación.
     */
    private boolean isEmployed(User user) {
        return user.status() == UserStatus.ACTIVE
                || (user.status() == UserStatus.LOCKED && user.lockedUntil() != null);
    }
}
