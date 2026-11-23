package com.condor.nexussoft.timeclock.geofencing.application;

import com.condor.nexussoft.timeclock.geofencing.domain.port.out.GeofenceRepositoryPort;
import com.condor.nexussoft.timeclock.geofencing.domain.port.out.QrTokenSignerPort;
import com.condor.nexussoft.timeclock.geofencing.domain.port.out.SiteQrTokenRepositoryPort;
import com.condor.nexussoft.timeclock.geofencing.domain.port.out.WorkSiteDirectoryPort;
import com.condor.nexussoft.timeclock.shared.domain.ResourceNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;

/** No se definen geocercas ni se emiten QR sobre centros de otra empresa. */
@ExtendWith(MockitoExtension.class)
class GeofencingServiceTenantTest {

    @Mock private GeofenceRepositoryPort geofences;
    @Mock private SiteQrTokenRepositoryPort qrTokens;
    @Mock private QrTokenSignerPort signer;
    @Mock private WorkSiteDirectoryPort workSites;

    private GeofencingService service;

    private final UUID tenant = UUID.randomUUID();
    private final UUID foreignSite = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new GeofencingService(geofences, qrTokens, signer, workSites, Clock.systemUTC(), 120, 366);
        when(workSites.belongsToTenant(tenant, foreignSite)).thenReturn(false);
    }

    @Test
    void geocerca_sobreCentroDeOtroTenant_noSeEncuentra() {
        assertThatThrownBy(() -> service.upsertGeofence(tenant, foreignSite, 19.4, -99.1, 100))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(geofences, never()).save(any());
    }

    @Test
    void qr_deCentroDeOtroTenant_noSeEmite() {
        assertThatThrownBy(() -> service.generateQr(tenant, foreignSite, 5, null))
                .isInstanceOf(ResourceNotFoundException.class);
        verifyNoInteractions(qrTokens, signer);
    }
}
