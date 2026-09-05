package com.condor.nexussoft.timeclock.attendance.infrastructure.integration;

import com.condor.nexussoft.timeclock.attendance.domain.port.out.CompanyPolicyPort;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.WorkSitePolicyPort;
import com.condor.nexussoft.timeclock.organization.domain.GeoPoint;
import com.condor.nexussoft.timeclock.organization.domain.WorkSite;
import com.condor.nexussoft.timeclock.organization.domain.port.in.WorkSiteManagementUseCase;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Herencia de política empresa → centro (HU-13 CA1). El override del centro es tri-estado:
 * {@code NULL} hereda, {@code TRUE}/{@code FALSE} sobrescriben. Tratar el nulo como "desactivado"
 * dejaría la política de la empresa sin ningún efecto.
 */
@ExtendWith(MockitoExtension.class)
class WorkSitePolicyAdapterTest {

    @Mock WorkSiteManagementUseCase workSites;
    @Mock CompanyPolicyPort companyPolicy;
    @InjectMocks WorkSitePolicyAdapter adapter;

    final UUID tenantId = UUID.randomUUID();
    final UUID siteId = UUID.randomUUID();

    private void company(boolean requirePhoto, Integer accuracy) {
        when(companyPolicy.find(tenantId))
                .thenReturn(new CompanyPolicyPort.CompanyPolicy(accuracy, requirePhoto, false,
                        CompanyPolicyPort.DEFAULT_OPEN_SHIFT_MAX_HOURS));
    }

    private void site(Boolean requirePhoto, Integer accuracy) {
        when(workSites.find(tenantId, siteId)).thenReturn(Optional.of(new WorkSite(siteId, tenantId, "C1", "Centro",
                null, new GeoPoint(19.4, -99.1), null, accuracy, requirePhoto, null, WorkSite.Status.ACTIVE)));
    }

    @Test
    void centroSinOverride_heredaLaExigenciaDeLaEmpresa() {
        company(true, 50);
        site(null, null);

        WorkSitePolicyPort.SitePolicy policy = adapter.find(tenantId, siteId);

        assertThat(policy.requirePhoto()).isTrue();
        assertThat(policy.gpsAccuracyMaxM()).isEqualTo(50);
    }

    @Test
    void centroSinOverride_conEmpresaPermisiva_noExigeFoto() {
        company(false, null);
        site(null, null);

        assertThat(adapter.find(tenantId, siteId).requirePhoto()).isFalse();
    }

    /** Un centro puede eximirse explícitamente aunque la empresa exija foto. */
    @Test
    void centroConOverrideFalse_ganaALaEmpresa() {
        company(true, null);
        site(false, null);

        assertThat(adapter.find(tenantId, siteId).requirePhoto()).isFalse();
    }

    @Test
    void centroConOverrideTrue_exigeFotoAunqueLaEmpresaNoLoHaga() {
        company(false, null);
        site(true, null);

        assertThat(adapter.find(tenantId, siteId).requirePhoto()).isTrue();
    }

    @Test
    void precisionDelCentro_prevaleceSobreLaDeLaEmpresa() {
        company(false, 50);
        site(null, 10);

        assertThat(adapter.find(tenantId, siteId).gpsAccuracyMaxM()).isEqualTo(10);
    }

    /**
     * Un id de centro inválido —incluido el de un QR de otra organización— no puede servir para relajar
     * la política del tenant. Se consulta con {@code find}, que devuelve vacío en vez de lanzar: la
     * variante que lanza marcaba rollback-only la transacción del registro y su commit fallaba después
     * con {@code UnexpectedRollbackException}, dejando la marcación sin persistir.
     */
    @Test
    void centroInexistente_conservaLaPoliticaDeLaEmpresa() {
        company(true, 30);
        when(workSites.find(tenantId, siteId)).thenReturn(Optional.empty());

        WorkSitePolicyPort.SitePolicy policy = adapter.find(tenantId, siteId);

        assertThat(policy.requirePhoto()).isTrue();
        assertThat(policy.gpsAccuracyMaxM()).isEqualTo(30);
    }
}
