package com.condor.nexussoft.timeclock.attendance;

import com.condor.nexussoft.timeclock.attendance.domain.port.in.AttendanceResult;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.RegisterAttendanceCommand;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.RegisterAttendanceUseCase;
import com.condor.nexussoft.timeclock.geofencing.domain.port.in.GeofencingUseCase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Recorre la jornada completa contra PostgreSQL real (Testcontainers + migraciones Flyway), que es
 * donde vive el estado de la secuencia: el resto de pruebas de secuencia trabaja con mocks del
 * repositorio y no puede demostrar que la consulta del último evento aceptado devuelva lo esperado.
 *
 * <p>Cubre las dos preguntas que gobiernan RN-12 y RN-26: que la secuencia
 * {@code ENTRADA → INICIO_DESCANSO → FIN_DESCANSO → SALIDA} se acepta en orden y se rechaza fuera de
 * él, y que <b>un único QR de centro</b> sirve para todos esos eventos y también para un segundo
 * turno del mismo día.</p>
 */
@Testcontainers
@SpringBootTest(properties = {
        "spring.cache.type=none",
        "spring.autoconfigure.exclude="
                + "org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration,"
                + "org.springframework.boot.autoconfigure.data.redis.RedisReactiveAutoConfiguration",
        "outbox.relay-delay-ms=60000",
        "storage.minio.enabled=false"
})
class AttendanceSequenceIT {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGIS = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("nexus")
            .withUsername("nexus")
            .withPassword("nexus");

    private static final double LAT = 19.4326;
    private static final double LON = -99.1332;

    @Autowired
    private RegisterAttendanceUseCase attendance;
    @Autowired
    private GeofencingUseCase geofencing;
    @Autowired
    private JdbcTemplate jdbc;

    private UUID tenantId;
    private UUID userId;
    private UUID siteId;
    private String qr;

    /**
     * Siembra el mínimo para registrar: empresa, colaborador, centro y su geocerca. No se asigna
     * turno a propósito —sin turno vigente no hay restricción horaria— para que la prueba mida la
     * secuencia y el QR, no la ventana de horario.
     */
    @BeforeEach
    void seed() {
        tenantId = UUID.randomUUID();
        userId = UUID.randomUUID();
        siteId = UUID.randomUUID();
        String suffix = tenantId.toString().substring(0, 8);

        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, ?)",
                tenantId, "IT-" + suffix, "Empresa de prueba");
        jdbc.update("INSERT INTO company_settings (company_id) VALUES (?)", tenantId);
        jdbc.update("INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name) "
                        + "VALUES (?, ?, ?, 'x', 'Ada', 'Lovelace')",
                userId, tenantId, "ada-" + suffix + "@example.com");
        jdbc.update("INSERT INTO work_sites (id, tenant_id, code, name, location) "
                        + "VALUES (?, ?, ?, 'Centro', ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography)",
                siteId, tenantId, "S-" + suffix, LON, LAT);
        jdbc.update("INSERT INTO geofences (tenant_id, work_site_id, type, center, radius_m) "
                        + "VALUES (?, ?, 'CIRCLE', ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, 200)",
                tenantId, siteId, LON, LAT);

        // Un único QR de centro, con la vigencia larga del cartel impreso (ADR-006 addendum).
        qr = geofencing.generateQr(tenantId, siteId, null, Instant.now().plus(30, ChronoUnit.DAYS)).token();
    }

    @Test
    void jornadaCompleta_conUnSoloQr_esAceptadaEnOrden() {
        List<String> jornada = List.of("ENTRADA", "INICIO_DESCANSO", "FIN_DESCANSO", "SALIDA");

        for (String evento : jornada) {
            AttendanceResult result = attendance.register(tenantId, userId, cmd(evento));
            assertThat(result.status()).as("evento %s", evento).isEqualTo("ACCEPTED");
            assertThat(result.rejectionReason()).isNull();
        }

        // Los cuatro registros comparten el nonce del mismo QR (RN-26: no se consume).
        List<String> nonces = jdbc.queryForList(
                "SELECT DISTINCT qr_nonce FROM attendance_records WHERE tenant_id = ? AND status = 'ACCEPTED'",
                String.class, tenantId);
        assertThat(nonces).hasSize(1);
        assertThat(nonces.get(0)).isNotNull();
    }

    /** Segundo turno del mismo día: el QR de centro no está ligado a usuario, turno ni fecha. */
    @Test
    void segundoTurnoDelMismoDia_reutilizaElMismoQr() {
        assertThat(register("ENTRADA")).isEqualTo("ACCEPTED");
        assertThat(register("SALIDA")).isEqualTo("ACCEPTED");

        assertThat(register("ENTRADA")).isEqualTo("ACCEPTED");
        assertThat(register("SALIDA")).isEqualTo("ACCEPTED");

        Integer aceptados = jdbc.queryForObject(
                "SELECT count(*) FROM attendance_records WHERE tenant_id = ? AND status = 'ACCEPTED'",
                Integer.class, tenantId);
        assertThat(aceptados).isEqualTo(4);
    }

    @Test
    void finDescanso_sinDescansoAbierto_esRechazadoPorSecuencia() {
        assertThat(register("ENTRADA")).isEqualTo("ACCEPTED");

        AttendanceResult result = attendance.register(tenantId, userId, cmd("FIN_DESCANSO"));

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("INVALID_SEQUENCE");
    }

    @Test
    void entradaDuplicada_sinCerrarLaJornada_esRechazada() {
        assertThat(register("ENTRADA")).isEqualTo("ACCEPTED");

        AttendanceResult result = attendance.register(tenantId, userId, cmd("ENTRADA"));

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(result.rejectionReason()).isEqualTo("INVALID_SEQUENCE");
    }

    /**
     * Una jornada abandonada hace más de {@code open_shift_max_hours} deja de contar como abierta:
     * sin esta cota el colaborador quedaría rechazado con INVALID_SEQUENCE indefinidamente, porque
     * nada cierra las jornadas huérfanas.
     */
    @Test
    void jornadaAbandonada_fueraDeLaVentana_noBloqueaLaSiguienteEntrada() {
        assertThat(register("ENTRADA")).isEqualTo("ACCEPTED");
        jdbc.update("UPDATE attendance_records SET server_time = server_time - interval '20 hours' "
                + "WHERE tenant_id = ?", tenantId);

        AttendanceResult result = attendance.register(tenantId, userId, cmd("ENTRADA"));

        assertThat(result.status()).isEqualTo("ACCEPTED");
    }

    private String register(String eventType) {
        return attendance.register(tenantId, userId, cmd(eventType)).status();
    }

    /** Cada pulsación lleva su propio operationUuid, como hace el móvil (RN-51). */
    private RegisterAttendanceCommand cmd(String eventType) {
        return new RegisterAttendanceCommand(UUID.randomUUID(), siteId, qr, LAT, LON, 10.0,
                eventType, "device-it-1", null, "ONLINE",
                false, false, false, false, true, false,
                null, null, null, "ANDROID", "Pixel 7", "14");
    }
}
