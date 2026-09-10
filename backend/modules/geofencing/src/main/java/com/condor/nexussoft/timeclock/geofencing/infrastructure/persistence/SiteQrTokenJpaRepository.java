package com.condor.nexussoft.timeclock.geofencing.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface SiteQrTokenJpaRepository extends JpaRepository<SiteQrTokenJpaEntity, UUID> {

    @Modifying
    @Query("update SiteQrTokenJpaEntity t set t.active = false "
            + "where t.workSiteId = :workSiteId and t.tenantId = :tenantId and t.active = true")
    void deactivateActiveForSite(@Param("workSiteId") UUID workSiteId, @Param("tenantId") UUID tenantId);

    /** Rotación del QR de empresa: el anterior (work_site_id nulo) deja de estar activo. */
    @Modifying
    @Query("update SiteQrTokenJpaEntity t set t.active = false "
            + "where t.workSiteId is null and t.tenantId = :tenantId and t.active = true")
    void deactivateActiveForCompany(@Param("tenantId") UUID tenantId);

    @Query("select count(t) > 0 from SiteQrTokenJpaEntity t "
            + "where t.tenantId = :tenantId and t.nonce = :nonce and t.workSiteId is null and t.active = true")
    boolean existsActiveCompanyToken(@Param("tenantId") UUID tenantId, @Param("nonce") String nonce);
}
