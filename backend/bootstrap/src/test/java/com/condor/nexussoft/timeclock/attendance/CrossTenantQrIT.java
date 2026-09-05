package com.condor.nexussoft.timeclock.attendance;

import com.condor.nexussoft.timeclock.attendance.domain.port.in.AttendanceResult;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.RegisterAttendanceCommand;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.RegisterAttendanceUseCase;
import com.condor.nexussoft.timeclock.geofencing.domain.port.in.GeofencingUseCase;
import com.condor.nexussoft.timeclock.support.PostgisIntegrationTest;
import com.condor.nexussoft.timeclock.sync.domain.port.in.SyncAttendanceUseCase;
import com.condor.nexussoft.timeclock.sync.domain.port.in.SyncItemResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Un colaborador escanea el QR de OTRA organización (RN-25). Debe salir un rechazo limpio
 * {@code INVALID_QR}, persistido como intento.
 *
 * <p>Hace falta base real: el fallo que cubre esta prueba solo existe con transacciones de verdad.
 * Al no reconocerse el centro para el tenant del colaborador, la política de centro se resolvía con
 * un método {@code @Transactional} que lanzaba {@code ResourceNotFoundException}; capturarla no
 * bastaba, porque Spring ya había marcado <i>rollback-only</i> la transacción compartida del registro
 * y el commit terminaba en {@code UnexpectedRollbackException}. El módulo de sync lo traducía a un
 * {@code SYNC_ERROR} genérico con HTTP 200 y el móvil dejaba la marcación en la cola local para
 * siempre, anunciándola como falta de conexión. Con mocks (RegisterAttendanceServiceTest) esto no se
 * reproduce: no hay transacción que envenenar.</p>
 */
class CrossTenantQrIT extends PostgisIntegrationTest {

    private static final double LAT = 19.4326;
    private static final double LON = -99.1332;

    @Autowired
    private RegisterAttendanceUseCase attendance;
    @Autowired
    private SyncAttendanceUseCase sync;
    @Autowired
    private GeofencingUseCase geofencing;
    @Autowired
    private JdbcTemplate jdbc;

    private UUID tenantPropio;
    private UUID userId;
    private UUID sitioAjeno;
    private String qrAjeno;

    /** Dos empresas: el colaborador es de la primera y el QR (y su centro) son de la segunda. */
    @BeforeEach
    void seed() {
        tenantPropio = seedCompany();
        UUID tenantAjeno = seedCompany();

        userId = UUID.randomUUID();
        jdbc.update("INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name) "
                        + "VALUES (?, ?, ?, 'x', 'Ada', 'Lovelace')",
                userId, tenantPropio, "ada-" + userId.toString().substring(0, 8) + "@example.com");

        seedSite(tenantPropio);
        sitioAjeno = seedSite(tenantAjeno);

        qrAjeno = geofencing.generateQr(tenantAjeno, sitioAjeno, null,
                Instant.now().plus(30, ChronoUnit.DAYS)).token();
    }

    @Test
    void qrDeOtraOrganizacion_esRechazadoComoQrInvalido() {
        AttendanceResult result = attendance.register(tenantPropio, userId, cmd());

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("INVALID_QR");
    }

    /** El intento queda registrado: sin esto un fichaje en otra empresa no dejaría rastro. */
    @Test
    void qrDeOtraOrganizacion_dejaElIntentoPersistido() {
        attendance.register(tenantPropio, userId, cmd());

        Integer rechazos = jdbc.queryForObject(
                "SELECT count(*) FROM attendance_records "
                        + "WHERE tenant_id = ? AND status = 'REJECTED' AND rejection_reason = 'INVALID_QR'",
                Integer.class, tenantPropio);
        assertThat(rechazos).isEqualTo(1);
    }

    /**
     * El camino que usa el móvil. {@code error} no nulo es lo que la app interpreta como fallo
     * transitorio y reintenta indefinidamente, dejando la marcación como pendiente de sincronizar.
     */
    @Test
    void porLaViaDeSincronizacion_devuelveRechazoYNoErrorTransitorio() {
        List<SyncItemResult> results = sync.sync(tenantPropio, userId, List.of(cmd()));

        assertThat(results).hasSize(1);
        assertThat(results.get(0).error()).isNull();
        assertThat(results.get(0).status()).isEqualTo("REJECTED");
        assertThat(results.get(0).rejectionReason()).isEqualTo("INVALID_QR");
    }

    private UUID seedCompany() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, ?)",
                id, "IT-" + id.toString().substring(0, 8), "Empresa de prueba");
        jdbc.update("INSERT INTO company_settings (company_id) VALUES (?)", id);
        return id;
    }

    private UUID seedSite(UUID tenantId) {
        UUID siteId = UUID.randomUUID();
        jdbc.update("INSERT INTO work_sites (id, tenant_id, code, name, location) "
                        + "VALUES (?, ?, ?, 'Centro', ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography)",
                siteId, tenantId, "S-" + siteId.toString().substring(0, 8), LON, LAT);
        jdbc.update("INSERT INTO geofences (tenant_id, work_site_id, type, center, radius_m) "
                        + "VALUES (?, ?, 'CIRCLE', ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, 200)",
                tenantId, siteId, LON, LAT);
        return siteId;
    }

    /** Lo que manda el móvil tras escanear: el token ajeno y el centro que ese token declara. */
    private RegisterAttendanceCommand cmd() {
        return new RegisterAttendanceCommand(UUID.randomUUID(), sitioAjeno, qrAjeno, LAT, LON, 10.0,
                "ENTRADA", "device-it-1", null, "ONLINE",
                false, false, false, false, true, false,
                null, null, null, "ANDROID", "Pixel 7", "14");
    }
}
