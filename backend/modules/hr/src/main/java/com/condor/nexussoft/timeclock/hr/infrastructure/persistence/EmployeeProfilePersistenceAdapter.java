package com.condor.nexussoft.timeclock.hr.infrastructure.persistence;

import com.condor.nexussoft.timeclock.hr.domain.EmployeeProfile;
import com.condor.nexussoft.timeclock.hr.domain.port.out.EmployeeProfileRepositoryPort;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class EmployeeProfilePersistenceAdapter implements EmployeeProfileRepositoryPort {

    private final EmployeeProfileJpaRepository repository;
    private final EmployeeDirectoryQuery directory;

    public EmployeeProfilePersistenceAdapter(EmployeeProfileJpaRepository repository, EmployeeDirectoryQuery directory) {
        this.repository = repository;
        this.directory = directory;
    }

    @Override
    public boolean isTenantUser(UUID tenantId, UUID userId) {
        return directory.belongsTo(tenantId, userId);
    }

    @Override
    public Optional<EmployeeProfile> findByUserId(UUID tenantId, UUID userId) {
        return repository.findById(userId)
                .filter(e -> e.getTenantId() != null && e.getTenantId().equals(tenantId))
                .map(EmployeeProfilePersistenceAdapter::toDomain);
    }

    @Override
    public EmployeeProfile save(EmployeeProfile p) {
        EmployeeProfileJpaEntity e = repository.findById(p.userId()).orElseGet(EmployeeProfileJpaEntity::new);
        // Nunca se mueve un perfil existente a otro tenant.
        if (e.getTenantId() != null && !e.getTenantId().equals(p.tenantId())) {
            throw new NoSuchElementException("Colaborador no encontrado.");
        }
        e.setUserId(p.userId());
        e.setTenantId(p.tenantId());
        e.setBirthDate(p.birthDate());
        e.setHireDate(p.hireDate());
        e.setGender(p.gender());
        e.setPhone(p.phone());
        e.setAddress(p.address());
        e.setEmergencyContactName(p.emergencyContactName());
        e.setEmergencyContactPhone(p.emergencyContactPhone());
        return toDomain(repository.save(e));
    }

    static EmployeeProfile toDomain(EmployeeProfileJpaEntity e) {
        return new EmployeeProfile(e.getUserId(), e.getTenantId(), e.getBirthDate(), e.getHireDate(),
                e.getGender(), e.getPhone(), e.getAddress(), e.getEmergencyContactName(), e.getEmergencyContactPhone());
    }
}
