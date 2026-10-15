package com.condor.nexussoft.timeclock.tenancy.infrastructure.persistence;

import com.condor.nexussoft.timeclock.tenancy.domain.CompanyCapacity;
import com.condor.nexussoft.timeclock.tenancy.domain.port.out.CompanyCapacityRepositoryPort;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class CompanyCapacityPersistenceAdapter implements CompanyCapacityRepositoryPort {

    private final CompanyCapacityJpaRepository capacities;

    public CompanyCapacityPersistenceAdapter(CompanyCapacityJpaRepository capacities) {
        this.capacities = capacities;
    }

    @Override
    public Optional<CompanyCapacity> find(UUID companyId) {
        return capacities.findById(companyId).map(this::toDomain);
    }

    @Override
    public List<CompanyCapacity> findAll(Collection<UUID> companyIds) {
        return capacities.findAllById(companyIds).stream().map(this::toDomain).toList();
    }

    @Override
    public Optional<CompanyCapacity> findForUpdate(UUID companyId) {
        return capacities.findByCompanyId(companyId).map(this::toDomain);
    }

    @Override
    public CompanyCapacity save(CompanyCapacity capacity, UUID updatedBy) {
        CompanyCapacityJpaEntity entity = capacities.findById(capacity.companyId())
                .orElseGet(() -> new CompanyCapacityJpaEntity(capacity.companyId()));
        entity.setBaseLimit(capacity.baseLimit());
        entity.setBlockSize(capacity.blockSize());
        entity.setExtraBlocks(capacity.extraBlocks());
        entity.setUpdatedBy(updatedBy);
        return toDomain(capacities.save(entity));
    }

    private CompanyCapacity toDomain(CompanyCapacityJpaEntity e) {
        return new CompanyCapacity(e.getCompanyId(), e.getBaseLimit(), e.getBlockSize(), e.getExtraBlocks());
    }
}
