package com.condor.nexussoft.timeclock.organization.application;

import com.condor.nexussoft.timeclock.organization.domain.GeoPoint;
import com.condor.nexussoft.timeclock.organization.domain.WorkSite;
import com.condor.nexussoft.timeclock.organization.domain.port.in.WorkSiteCommands;
import com.condor.nexussoft.timeclock.organization.domain.port.in.WorkSiteManagementUseCase;
import com.condor.nexussoft.timeclock.organization.domain.port.out.WorkSiteRepositoryPort;
import com.condor.nexussoft.timeclock.shared.domain.DomainException;
import com.condor.nexussoft.timeclock.shared.domain.Paged;
import com.condor.nexussoft.timeclock.shared.domain.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Service
public class WorkSiteService implements WorkSiteManagementUseCase {

    private final WorkSiteRepositoryPort workSites;

    public WorkSiteService(WorkSiteRepositoryPort workSites) {
        this.workSites = workSites;
    }

    @Override
    @Transactional
    public WorkSite create(UUID tenantId, WorkSiteCommands.CreateWorkSiteCommand c) {
        if (workSites.existsByTenantAndCode(tenantId, c.code())) {
            throw new DomainException("DUPLICATE_CODE", "Ya existe un centro con el código " + c.code());
        }
        WorkSite site = WorkSite.create(tenantId, c.code(), c.name(), c.address(),
                new GeoPoint(c.latitude(), c.longitude()), c.timezone(),
                c.gpsAccuracyMaxM(), c.requirePhoto(), c.requireBiometric());
        return workSites.save(site);
    }

    @Override
    @Transactional
    public WorkSite update(UUID tenantId, UUID id, WorkSiteCommands.UpdateWorkSiteCommand c) {
        WorkSite site = requireSite(tenantId, id);
        site.update(c.name(), c.address(), new GeoPoint(c.latitude(), c.longitude()), c.timezone(),
                c.gpsAccuracyMaxM(), c.requirePhoto(), c.requireBiometric());
        return workSites.update(site);
    }

    @Override
    @Transactional
    public WorkSite changeStatus(UUID tenantId, UUID id, WorkSite.Status status) {
        WorkSite site = requireSite(tenantId, id);
        site.changeStatus(status);
        return workSites.update(site);
    }

    @Override
    @Transactional(readOnly = true)
    public WorkSite get(UUID tenantId, UUID id) {
        return requireSite(tenantId, id);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<WorkSite> find(UUID tenantId, UUID id) {
        return workSites.findByIdAndTenant(id, tenantId);
    }

    @Override
    @Transactional(readOnly = true)
    public Paged<WorkSite> list(UUID tenantId, int page, int size, String search) {
        return workSites.findAllByTenant(tenantId, page, size, search);
    }

    private WorkSite requireSite(UUID tenantId, UUID id) {
        return find(tenantId, id)
                .orElseThrow(() -> new ResourceNotFoundException("Centro de trabajo", id));
    }
}
