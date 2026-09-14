package com.condor.nexussoft.timeclock.scheduling;

import com.condor.nexussoft.timeclock.attendance.domain.port.out.ShiftZonePort;
import com.condor.nexussoft.timeclock.support.PostgisIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.ZoneId;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La cadena de herencia de la zona del turno: <b>horario → centro → empresa → UTC</b>, que
 * {@code V4__scheduling.sql:10} documenta y que el código no aplicaba.
 *
 * <p>Sin ella, un horario sin zona evaluaba la ventana de registro en UTC contra unas horas que el
 * administrador escribió en hora local. Para una empresa a UTC−6 eso desplaza la comparación seis
 * horas: fue la causa del retardo de 124 min de CN-000234 el 2026-09-14.</p>
 */
class ShiftZoneInheritanceIT extends PostgisIntegrationTest {

    private static final ZoneId MEXICO = ZoneId.of("America/Mexico_City");
    private static final ZoneId LIMA = ZoneId.of("America/Lima");
    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    private static final ZoneId UTC = ZoneId.of("UTC");

    @Autowired
    private ShiftZonePort zones;
    @Autowired
    private JdbcTemplate jdbc;

    private UUID tenantId;
    private String suffix;

    @BeforeEach
    void seed() {
        tenantId = UUID.randomUUID();
        suffix = tenantId.toString().substring(0, 8);
        jdbc.update("INSERT INTO companies (id, code, name, timezone) VALUES (?, ?, ?, ?)",
                tenantId, "TZ-" + suffix, "Empresa de prueba", MEXICO.getId());
    }

    @Test
    void laZonaDelHorarioManda() {
        UUID horario = horarioCon(LIMA.getId());
        UUID centro = centroCon(BOGOTA.getId());

        assertThat(zones.resolve(tenantId, horario, centro)).isEqualTo(LIMA);
    }

    @Test
    void horarioSinZona_heredaLaDelCentro() {
        UUID horario = horarioCon(null);
        UUID centro = centroCon(BOGOTA.getId());

        assertThat(zones.resolve(tenantId, horario, centro)).isEqualTo(BOGOTA);
    }

    /** La cadena real del caso: horario y centro en blanco, empresa a UTC−6. */
    @Test
    void horarioYCentroSinZona_heredanLaDeLaEmpresa() {
        UUID horario = horarioCon(null);
        UUID centro = centroCon(null);

        assertThat(zones.resolve(tenantId, horario, centro)).isEqualTo(MEXICO);
    }

    /** La cadena real del camino sin centro (QR de empresa): no hay centro del que heredar. */
    @Test
    void sinCentro_heredaLaDeLaEmpresa() {
        UUID horario = horarioCon(null);

        assertThat(zones.resolve(tenantId, horario, null)).isEqualTo(MEXICO);
    }

    /**
     * Cadena vacía, no NULL: es lo que manda el formulario web cuando se deja el campo en blanco
     * ({@code schedule-form.component.ts}), y significa «heredar», no «UTC».
     */
    @Test
    void zonaEnBlanco_seTrataComoAusente() {
        UUID horario = horarioCon("");

        assertThat(zones.resolve(tenantId, horario, centroCon(""))).isEqualTo(MEXICO);
    }

    @Test
    void empresaSinZona_caeAUtc() {
        jdbc.update("UPDATE companies SET timezone = 'UTC' WHERE id = ?", tenantId);

        assertThat(zones.resolve(tenantId, horarioCon(null), null)).isEqualTo(UTC);
    }

    /** Dato corrupto: no puede tumbar el registro de asistencia. */
    @Test
    void zonaMalEscrita_caeAUtc() {
        assertThat(zones.resolve(tenantId, horarioCon("Marte/Olympus"), null)).isEqualTo(UTC);
    }

    @Test
    void horarioInexistente_caeAUtc() {
        assertThat(zones.resolve(tenantId, UUID.randomUUID(), null)).isEqualTo(UTC);
    }

    /** Un horario de otro tenant no resuelve zona: la consulta va acotada por tenant. */
    @Test
    void horarioDeOtroTenant_caeAUtc() {
        UUID horario = horarioCon(LIMA.getId());

        assertThat(zones.resolve(UUID.randomUUID(), horario, null)).isEqualTo(UTC);
    }

    // --- siembra ---------------------------------------------------------------------------

    private UUID horarioCon(String timezone) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO schedules (id, tenant_id, code, name, timezone) VALUES (?, ?, ?, ?, ?)",
                id, tenantId, "H-" + id.toString().substring(0, 8), "Horario", timezone);
        return id;
    }

    private UUID centroCon(String timezone) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO work_sites (id, tenant_id, code, name, location, timezone) "
                        + "VALUES (?, ?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?)",
                id, tenantId, "C-" + id.toString().substring(0, 8), "Centro",
                -99.1332, 19.4326, timezone);
        return id;
    }
}
