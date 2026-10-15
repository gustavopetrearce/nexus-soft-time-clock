package com.condor.nexussoft.timeclock.tenancy.application;

import com.condor.nexussoft.timeclock.shared.domain.ConflictException;
import com.condor.nexussoft.timeclock.shared.domain.ResourceNotFoundException;
import com.condor.nexussoft.timeclock.tenancy.domain.CapacityStatus;
import com.condor.nexussoft.timeclock.tenancy.domain.CompanyCapacity;
import com.condor.nexussoft.timeclock.tenancy.domain.port.in.CompanyCapacityUseCase;
import com.condor.nexussoft.timeclock.tenancy.domain.port.out.ActiveCollaboratorCounterPort;
import com.condor.nexussoft.timeclock.tenancy.domain.port.out.CompanyCapacityRepositoryPort;
import com.condor.nexussoft.timeclock.tenancy.domain.port.out.CompanyRepositoryPort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/** Cupo de colaboradores activos del tenant (RF-29, RN-34..RN-37). Ver ADR-012. */
@Service
public class CompanyCapacityService implements CompanyCapacityUseCase {

    private final CompanyCapacityRepositoryPort capacities;
    private final ActiveCollaboratorCounterPort collaborators;
    private final CompanyRepositoryPort companies;

    public CompanyCapacityService(CompanyCapacityRepositoryPort capacities,
                                  ActiveCollaboratorCounterPort collaborators,
                                  CompanyRepositoryPort companies) {
        this.capacities = capacities;
        this.collaborators = collaborators;
        this.companies = companies;
    }

    @Override
    @Transactional(readOnly = true)
    public CapacityStatus get(UUID companyId) {
        requireCompany(companyId);
        return CapacityStatus.of(current(companyId), collaborators.countActiveCollaborators(companyId));
    }

    @Override
    @Transactional(readOnly = true)
    public List<CapacityStatus> getMany(Collection<UUID> companyIds) {
        if (companyIds == null || companyIds.isEmpty()) {
            return List.of();
        }
        Map<UUID, CompanyCapacity> contratado = capacities.findAll(companyIds).stream()
                .collect(Collectors.toMap(CompanyCapacity::companyId, c -> c));
        Map<UUID, Long> usado = collaborators.countActiveCollaboratorsByTenant(companyIds);
        return companyIds.stream()
                .map(id -> CapacityStatus.of(
                        contratado.getOrDefault(id, CompanyCapacity.defaultsFor(id)),
                        usado.getOrDefault(id, 0L)))
                .toList();
    }

    @Override
    @Transactional
    public CapacityStatus setExtraBlocks(UUID companyId, int extraBlocks, UUID actorUserId) {
        // Se bloquea la fila también al cambiar bloques: si no, una reducción y un alta
        // simultáneas pueden validarse ambas contra el estado previo a la otra.
        requireCompany(companyId);
        CompanyCapacity updated = capacities.findForUpdate(companyId)
                .orElseGet(() -> CompanyCapacity.defaultsFor(companyId))
                .withExtraBlocks(extraBlocks);

        long used = collaborators.countActiveCollaborators(companyId);
        if (used > updated.limit()) {
            throw new ConflictException("CAPACITY_BELOW_USAGE", String.format(
                    "La empresa tiene %d colaboradores activos y el cupo propuesto es de %d. "
                            + "Haga %d baja(s) o deje al menos %d bloque(s) adicional(es).",
                    used, updated.limit(), used - updated.limit(), updated.blocksNeededFor(used)));
        }
        return CapacityStatus.of(capacities.save(updated, actorUserId), used);
    }

    @Override
    @Transactional
    public void requireSlotForNewCollaborator(UUID tenantId) {
        CompanyCapacity capacity = capacities.findForUpdate(tenantId)
                .orElseGet(() -> CompanyCapacity.defaultsFor(tenantId));
        long used = collaborators.countActiveCollaborators(tenantId);
        if (used >= capacity.limit()) {
            throw new ConflictException("CAPACITY_EXCEEDED", String.format(
                    "La empresa alcanzó su cupo de colaboradores activos: límite %d, usados %d, "
                            + "disponibles 0. Solicite al super administrador un bloque adicional "
                            + "de %d colaboradores, o dé de baja a quien ya no registre.",
                    capacity.limit(), used, capacity.blockSize()));
        }
    }

    /**
     * Sin esta comprobación, el cupo de un id inexistente devolvía la oferta estándar y fijarle
     * bloques acababa en un 500 por la FK de {@code company_capacity}: mejor un 404 explícito.
     */
    private void requireCompany(UUID companyId) {
        if (companies.findById(companyId).isEmpty()) {
            throw new ResourceNotFoundException("Empresa", companyId);
        }
    }

    private CompanyCapacity current(UUID companyId) {
        // Un tenant sin fila de capacidad opera con la oferta estándar, igual que
        // CompanySettingsService con su configuración: devolver 404 aquí dejaría el portal
        // sin poder mostrar el cupo de una empresa anterior a V27.
        return capacities.find(companyId).orElseGet(() -> CompanyCapacity.defaultsFor(companyId));
    }
}
