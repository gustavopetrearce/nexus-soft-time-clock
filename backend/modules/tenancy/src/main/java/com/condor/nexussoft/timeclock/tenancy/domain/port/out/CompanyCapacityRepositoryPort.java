package com.condor.nexussoft.timeclock.tenancy.domain.port.out;

import com.condor.nexussoft.timeclock.tenancy.domain.CompanyCapacity;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CompanyCapacityRepositoryPort {

    Optional<CompanyCapacity> find(UUID companyId);

    /** Cupos de varias empresas; las que no tengan fila simplemente no vienen. */
    List<CompanyCapacity> findAll(Collection<UUID> companyIds);

    /**
     * Lee el cupo <b>bloqueando la fila</b> hasta el fin de la transacción (RN-37). Sin este
     * bloqueo, dos altas simultáneas en el límite leen el mismo conteo y ambas pasan.
     */
    Optional<CompanyCapacity> findForUpdate(UUID companyId);

    CompanyCapacity save(CompanyCapacity capacity, UUID updatedBy);
}
