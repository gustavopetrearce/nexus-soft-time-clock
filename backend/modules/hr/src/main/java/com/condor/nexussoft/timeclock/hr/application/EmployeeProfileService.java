package com.condor.nexussoft.timeclock.hr.application;

import com.condor.nexussoft.timeclock.hr.domain.EmployeeProfile;
import com.condor.nexussoft.timeclock.hr.domain.port.in.EmployeeProfileUseCase;
import com.condor.nexussoft.timeclock.hr.domain.port.out.EmployeeProfileRepositoryPort;
import java.util.NoSuchElementException;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Alta/edición y consulta del perfil de empleado (datos personales opcionales). */
@Service
public class EmployeeProfileService implements EmployeeProfileUseCase {

    private final EmployeeProfileRepositoryPort repository;

    public EmployeeProfileService(EmployeeProfileRepositoryPort repository) {
        this.repository = repository;
    }

    @Override
    @Transactional(readOnly = true)
    public EmployeeProfile get(UUID tenantId, UUID userId) {
        return repository.findByUserId(tenantId, userId)
                .orElseGet(() -> new EmployeeProfile(userId, tenantId, null, null, null, null, null, null, null));
    }

    @Override
    @Transactional
    public EmployeeProfile upsert(UpsertProfileCommand c) {
        if (c.userId() == null || !repository.isTenantUser(c.tenantId(), c.userId())) {
            throw new NoSuchElementException("Colaborador no encontrado.");
        }
        EmployeeProfile profile = new EmployeeProfile(
                c.userId(), c.tenantId(), c.birthDate(), c.hireDate(), c.gender(),
                c.phone(), c.address(), c.emergencyContactName(), c.emergencyContactPhone());
        return repository.save(profile);
    }
}
