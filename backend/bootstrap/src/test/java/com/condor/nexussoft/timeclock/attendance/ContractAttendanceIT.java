package com.condor.nexussoft.timeclock.attendance;

import com.condor.nexussoft.timeclock.identity.domain.port.out.PasswordHasherPort;
import com.condor.nexussoft.timeclock.platform.outbox.OutboxProcessor;
import com.condor.nexussoft.timeclock.support.PostgisIntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.sql.Date;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Marcación y contrato (iteración 14, fase 2) con la BD real: la marca se atribuye al proyecto del
 * contrato (RN-67) y, fuera de su vigencia, se acepta marcada y la ENTRADA abre una incidencia
 * FUERA_DE_VIGENCIA al pasar por el outbox (RN-66). Se usa el canal externo porque no exige QR ni GPS
 * y comparte la regla con la marcación por QR.
 */
@AutoConfigureMockMvc
class ContractAttendanceIT extends PostgisIntegrationTest {

    private static final String PASSWORD = "secret-123";

    @Autowired
    private MockMvc mvc;
    @Autowired
    private ObjectMapper json;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private PasswordHasherPort passwordHasher;
    @Autowired
    private OutboxProcessor outbox;

    private UUID tenantId;
    private String companyCode;
    private String adminEmail;
    private String employeeCode;
    private UUID employeeId;
    private UUID siteId;
    private UUID projectId;
    private final LocalDate today = LocalDate.now(ZoneOffset.UTC);   // la empresa de prueba está en UTC

    @BeforeEach
    void seed() {
        tenantId = UUID.randomUUID();
        String suffix = tenantId.toString().substring(0, 8);
        companyCode = "CA-" + suffix;
        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, 'Empresa de prueba')", tenantId, companyCode);
        jdbc.update("INSERT INTO company_settings (company_id) VALUES (?)", tenantId);
        jdbc.update("INSERT INTO company_capacity (company_id) VALUES (?)", tenantId);

        adminEmail = "admin-" + suffix + "@example.com";
        assignRole(seedUser(adminEmail, null), "COMPANY_ADMIN");
        employeeCode = "EMP-" + suffix;
        employeeId = seedUser("emp-" + suffix + "@example.com", employeeCode);
        assignRole(employeeId, "EMPLOYEE");

        siteId = UUID.randomUUID();
        jdbc.update("INSERT INTO work_sites (id, tenant_id, code, name, location) "
                        + "VALUES (?, ?, ?, 'Centro', ST_SetSRID(ST_MakePoint(-99.13, 19.43), 4326)::geography)",
                siteId, tenantId, "S-" + suffix);

        projectId = UUID.randomUUID();
        jdbc.update("INSERT INTO projects (id, tenant_id, code, name, starts_on, ends_on) VALUES (?, ?, ?, 'Obra', ?, ?)",
                projectId, tenantId, "OBRA-" + suffix, Date.valueOf(today.minusDays(90)), Date.valueOf(today.plusDays(90)));
    }

    @Test
    void contratoVigente_laMarcaSeAtribuyeAlProyectoSinIncidencia() throws Exception {
        contract(today.minusDays(30), today.plusDays(30));

        JsonNode result = mark("ENTRADA");

        assertThat(result.get("status").asText()).isEqualTo("ACCEPTED");
        assertThat(flags(result)).doesNotContain("OUT_OF_CONTRACT");
        assertThat(recordProject(result)).isEqualTo(projectId);
        assertThat(relayAndCountIncidents("FUERA_DE_VIGENCIA")).isZero();
    }

    @Test
    void contratoTerminado_laMarcaSeAceptaMarcada_yAbreFueraDeVigencia() throws Exception {
        contract(today.minusDays(60), today.minusDays(10));

        JsonNode result = mark("ENTRADA");

        assertThat(result.get("status").asText()).isEqualTo("ACCEPTED");
        assertThat(flags(result)).contains("OUT_OF_CONTRACT");
        assertThat(recordProject(result)).isEqualTo(projectId);
        assertThat(relayAndCountIncidents("FUERA_DE_VIGENCIA")).isEqualTo(1);
    }

    @Test
    void proyectoCerrado_conContratoVigente_abreFueraDeVigencia() throws Exception {
        contract(today.minusDays(30), today.plusDays(30));
        jdbc.update("UPDATE projects SET status = 'CLOSED' WHERE id = ?", projectId);

        JsonNode result = mark("ENTRADA");

        assertThat(flags(result)).contains("OUT_OF_CONTRACT");
        assertThat(relayAndCountIncidents("FUERA_DE_VIGENCIA")).isEqualTo(1);
    }

    @Test
    void contratoPorTurno_noAtribuyeProyectoNiAbreIncidencia() throws Exception {
        jdbc.update("INSERT INTO employment_contracts (tenant_id, user_id, contract_type, starts_on) VALUES (?, ?, 'SHIFT', ?)",
                tenantId, employeeId, Date.valueOf(today.minusDays(30)));

        JsonNode result = mark("ENTRADA");

        assertThat(flags(result)).doesNotContain("OUT_OF_CONTRACT");
        assertThat(recordProject(result)).isNull();
        assertThat(relayAndCountIncidents("FUERA_DE_VIGENCIA")).isZero();
    }

    // --- utilidades ------------------------------------------------------------------------

    private void contract(LocalDate start, LocalDate end) {
        jdbc.update("INSERT INTO employment_contracts (tenant_id, user_id, contract_type, project_id, starts_on, ends_on) "
                        + "VALUES (?, ?, 'PROJECT', ?, ?, ?)",
                tenantId, employeeId, projectId, Date.valueOf(start), Date.valueOf(end));
    }

    private JsonNode mark(String eventType) throws Exception {
        String token = clientToken();
        String body = "{\"operationUuid\":\"" + UUID.randomUUID() + "\",\"employeeCode\":\"" + employeeCode
                + "\",\"workSiteId\":\"" + siteId + "\",\"eventType\":\"" + eventType + "\",\"eventTime\":\""
                + Instant.now().minus(5, ChronoUnit.MINUTES).truncatedTo(ChronoUnit.SECONDS) + "\"}";
        String response = mvc.perform(post("/api/v1/integrations/attendance")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(response);
    }

    private List<String> flags(JsonNode result) {
        return json.convertValue(result.get("flags"), json.getTypeFactory().constructCollectionType(List.class, String.class));
    }

    private UUID recordProject(JsonNode result) {
        return jdbc.queryForObject("SELECT project_id FROM attendance_records WHERE id = ?", UUID.class,
                UUID.fromString(result.get("recordId").asText()));
    }

    /** Pasa los eventos pendientes del tenant por el outbox (el relay está frenado en los ITs). */
    private int relayAndCountIncidents(String type) throws Exception {
        List<UUID> pending = jdbc.queryForList(
                "SELECT id FROM outbox_events WHERE tenant_id = ? AND status = 'PENDING' ORDER BY occurred_at",
                UUID.class, tenantId);
        for (UUID id : pending) {
            outbox.processOne(id);
        }
        return jdbc.queryForObject("SELECT count(*) FROM incidents WHERE tenant_id = ? AND type = ?",
                Integer.class, tenantId, type);
    }

    private UUID seedUser(String email, String code) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, employee_code) "
                        + "VALUES (?, ?, ?, ?, 'Ada', 'Lovelace', ?)",
                id, tenantId, email, passwordHasher.hash(PASSWORD), code);
        return id;
    }

    private void assignRole(UUID userId, String role) {
        UUID roleId = jdbc.queryForObject(
                "SELECT id FROM roles WHERE tenant_id IS NULL AND code = ?", UUID.class, role);
        jdbc.update("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", userId, roleId);
    }

    private String clientToken() throws Exception {
        String login = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "email", adminEmail, "password", PASSWORD, "companyCode", companyCode))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String admin = json.readTree(login).get("accessToken").asText();
        JsonNode client = json.readTree(mvc.perform(post("/api/v1/integrations/clients")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"ERP\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        String token = mvc.perform(post("/api/v1/oauth/token")
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("grant_type", "client_credentials")
                        .param("client_id", client.get("clientId").asText())
                        .param("client_secret", client.get("clientSecret").asText()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(token).get("access_token").asText();
    }
}
