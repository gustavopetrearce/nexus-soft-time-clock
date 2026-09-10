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
 * Registro sin centro de trabajo (RN-18, HU-17) contra el esquema real.
 *
 * <p>Hace falta base de verdad por tres motivos que ninguna prueba con mocks alcanza:</p>
 * <ul>
 *   <li>La marca se persiste con {@code work_site_id} nulo en una tabla <b>particionada</b>. Que la
 *       migración V25 retirase el {@code NOT NULL} y que eso se propagara a las particiones solo lo
 *       demuestra un INSERT real.</li>
 *   <li>El camino sin centro atraviesa {@code WorkSitePolicyAdapter} y {@code SchedulePolicyAdapter}
 *       con el centro a nulo, dentro de la <b>transacción compartida</b> del registro. Es el mismo
 *       terreno donde una excepción capturada dejaba la transacción en rollback-only y el commit
 *       reventaba con {@code UnexpectedRollbackException} (ver {@link CrossTenantQrIT}).</li>
 *   <li>Rotar el QR de empresa invalida el anterior consultando {@code site_qr_tokens}: sin base no
 *       hay tabla contra la que comprobarlo.</li>
 * </ul>
 *
 * <p>El almacenamiento de evidencias está desactivado en las pruebas y falla cerrado a propósito
 * ({@code DisabledObjectStorage}), así que aquí no se ejercita el caso aceptado —lo cubre
 * {@code RegisterAttendanceServiceTest}—, sino los rechazos, que recorren igualmente todo el camino
 * sin centro antes de decidir.</p>
 */
class SitelessAttendanceIT extends PostgisIntegrationTest {

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

    private UUID tenantId;
    private UUID userId;
    private UUID siteId;
    private String qrEmpresa;

    @BeforeEach
    void seed() {
        tenantId = seedCompany();
        userId = UUID.randomUUID();
        jdbc.update("INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name) "
                        + "VALUES (?, ?, ?, 'x', 'Grace', 'Hopper')",
                userId, tenantId, "grace-" + userId.toString().substring(0, 8) + "@example.com");
        siteId = seedSite(tenantId);
        habilitarSinCentro(true);
        qrEmpresa = generarQrEmpresa();
    }

    /**
     * El corazón de la migración: una marca sin centro llega hasta la exigencia de foto y queda
     * grabada con {@code work_site_id} nulo. Si el NOT NULL siguiera puesto, esto reventaría en el
     * INSERT en vez de resolverse con un motivo de negocio.
     */
    @Test
    void sinCentro_sinFoto_seRechazaPorFoto_yPersisteConCentroNulo() {
        AttendanceResult result = attendance.register(tenantId, userId, cmdSinCentro(qrEmpresa));

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("PHOTO_REQUIRED");
        assertThat(result.distanceToSiteM()).isNull();
        assertThat(result.flags()).contains("NO_GEOFENCE");

        Integer sinCentro = jdbc.queryForObject(
                "SELECT count(*) FROM attendance_records WHERE tenant_id = ? AND work_site_id IS NULL",
                Integer.class, tenantId);
        assertThat(sinCentro).isEqualTo(1);
    }

    /** Con la política apagada, un QR de empresa emitido antes deja de servir. */
    @Test
    void sinCentro_conPoliticaDesactivada_seRechaza() {
        habilitarSinCentro(false);

        AttendanceResult result = attendance.register(tenantId, userId, cmdSinCentro(qrEmpresa));

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("SITELESS_NOT_ALLOWED");
    }

    /** Omitir el centro frente a un QR de centro no puede ser una vía libre para saltarse la geocerca. */
    @Test
    void sinCentro_conQrDeCentro_seRechazaComoQrInvalido() {
        String qrDeCentro = geofencing.generateQr(tenantId, siteId, null,
                Instant.now().plus(30, ChronoUnit.DAYS)).token();

        AttendanceResult result = attendance.register(tenantId, userId, cmdSinCentro(qrDeCentro));

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("INVALID_QR");
    }

    /** Y al revés: un QR de empresa no acredita presencia en un centro concreto. */
    @Test
    void conCentro_conQrDeEmpresa_seRechazaComoQrInvalido() {
        RegisterAttendanceCommand conCentro = new RegisterAttendanceCommand(UUID.randomUUID(), siteId,
                qrEmpresa, LAT, LON, 10.0, "ENTRADA", "device-it-1", null, "ONLINE",
                false, false, false, false, true, false,
                null, null, null, "ANDROID", "Pixel 7", "14");

        AttendanceResult result = attendance.register(tenantId, userId, conCentro);

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("INVALID_QR");
    }

    /**
     * Rotar el QR de empresa invalida el anterior de inmediato. Es lo que lo separa del QR de centro
     * —cuya rotación es cosmética hasta que caduca—: este sirve desde cualquier lugar y no tiene una
     * geocerca detrás que acote el daño de una foto del cartel.
     */
    @Test
    void qrDeEmpresaRotado_dejaDeServir() {
        String anterior = qrEmpresa;
        generarQrEmpresa();

        AttendanceResult result = attendance.register(tenantId, userId, cmdSinCentro(anterior));

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("INVALID_QR");
    }

    /**
     * El camino que usa el móvil. Un {@code error} no nulo es lo que la app interpreta como fallo
     * transitorio y reintenta para siempre; un rechazo de negocio debe salir como tal.
     */
    @Test
    void porLaViaDeSincronizacion_devuelveRechazoYNoErrorTransitorio() {
        List<SyncItemResult> results = sync.sync(tenantId, userId, List.of(cmdSinCentro(qrEmpresa)));

        assertThat(results).hasSize(1);
        assertThat(results.get(0).error()).isNull();
        assertThat(results.get(0).status()).isEqualTo("REJECTED");
        assertThat(results.get(0).rejectionReason()).isEqualTo("PHOTO_REQUIRED");
    }

    private String generarQrEmpresa() {
        qrEmpresa = geofencing.generateCompanyQr(tenantId, null,
                Instant.now().plus(30, ChronoUnit.DAYS)).token();
        return qrEmpresa;
    }

    private void habilitarSinCentro(boolean enabled) {
        jdbc.update("UPDATE company_settings SET siteless_attendance_enabled = ? WHERE company_id = ?",
                enabled, tenantId);
    }

    private UUID seedCompany() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, ?)",
                id, "IT-" + id.toString().substring(0, 8), "Empresa de prueba");
        jdbc.update("INSERT INTO company_settings (company_id) VALUES (?)", id);
        return id;
    }

    private UUID seedSite(UUID tenant) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO work_sites (id, tenant_id, code, name, location) "
                        + "VALUES (?, ?, ?, 'Centro', ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography)",
                id, tenant, "S-" + id.toString().substring(0, 8), LON, LAT);
        jdbc.update("INSERT INTO geofences (tenant_id, work_site_id, type, center, radius_m) "
                        + "VALUES (?, ?, 'CIRCLE', ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, 200)",
                tenant, id, LON, LAT);
        return id;
    }

    /** Lo que manda el móvil tras escanear un QR de empresa: token, GPS y ningún centro. */
    private RegisterAttendanceCommand cmdSinCentro(String qrToken) {
        return new RegisterAttendanceCommand(UUID.randomUUID(), null, qrToken, LAT, LON, 10.0,
                "ENTRADA", "device-it-1", null, "ONLINE",
                false, false, false, false, true, false,
                null, null, null, "ANDROID", "Pixel 7", "14");
    }
}
