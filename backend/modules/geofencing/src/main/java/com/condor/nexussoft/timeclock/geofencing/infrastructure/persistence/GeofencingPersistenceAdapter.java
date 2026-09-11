package com.condor.nexussoft.timeclock.geofencing.infrastructure.persistence;

import com.condor.nexussoft.timeclock.geofencing.domain.Geofence;
import com.condor.nexussoft.timeclock.geofencing.domain.SiteQrToken;
import com.condor.nexussoft.timeclock.geofencing.domain.port.out.GeofenceRepositoryPort;
import com.condor.nexussoft.timeclock.geofencing.domain.port.out.SiteQrTokenRepositoryPort;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public class GeofencingPersistenceAdapter implements GeofenceRepositoryPort, SiteQrTokenRepositoryPort {

    private final GeofenceJpaRepository geofenceRepo;
    private final SiteQrTokenJpaRepository qrRepo;

    public GeofencingPersistenceAdapter(GeofenceJpaRepository geofenceRepo, SiteQrTokenJpaRepository qrRepo) {
        this.geofenceRepo = geofenceRepo;
        this.qrRepo = qrRepo;
    }

    // --- Geofence ---
    @Override
    public Optional<Geofence> findActiveByWorkSite(UUID workSiteId, UUID tenantId) {
        return geofenceRepo.findByWorkSiteIdAndTenantIdAndActiveTrue(workSiteId, tenantId).map(this::toDomain);
    }

    @Override
    public Geofence save(Geofence g) {
        geofenceRepo.save(new GeofenceJpaEntity(g.id(), g.tenantId(), g.workSiteId(), "CIRCLE",
                GeoSupport.toPoint(g.center()), g.radiusM(), g.active()));
        return g;
    }

    @Override
    public Geofence update(Geofence g) {
        GeofenceJpaEntity e = geofenceRepo.findById(g.id()).orElseThrow();
        e.setCenter(GeoSupport.toPoint(g.center()));
        e.setRadiusM(g.radiusM());
        geofenceRepo.save(e);
        return g;
    }

    // --- SiteQrToken ---
    @Override
    public void deactivateActiveForSite(UUID workSiteId, UUID tenantId) {
        qrRepo.deactivateActiveForSite(workSiteId, tenantId);
    }

    @Override
    public void deactivateActiveForCompany(UUID tenantId) {
        qrRepo.deactivateActiveForCompany(tenantId);
    }

    @Override
    public boolean isActiveCompanyToken(UUID tenantId, String nonce) {
        return nonce != null && qrRepo.existsActiveCompanyToken(tenantId, nonce);
    }

    @Override
    public SiteQrToken save(SiteQrToken t) {
        qrRepo.save(new SiteQrTokenJpaEntity(t.id(), t.tenantId(), t.workSiteId(), t.nonce(), t.keyId(),
                t.issuedAt(), t.expiresAt(), t.active()));
        return t;
    }

    private Geofence toDomain(GeofenceJpaEntity e) {
        return new Geofence(e.getId(), e.getTenantId(), e.getWorkSiteId(),
                GeoSupport.toGeoPoint(e.getCenter()), e.getRadiusM(), e.isActive());
    }
}
