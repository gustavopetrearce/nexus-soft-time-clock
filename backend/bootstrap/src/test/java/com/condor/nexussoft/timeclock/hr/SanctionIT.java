package com.condor.nexussoft.timeclock.hr;

import com.condor.nexussoft.timeclock.identity.domain.port.out.PasswordHasherPort;
import com.condor.nexussoft.timeclock.support.PostgisIntegrationTest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Sanciones (V39) con la seguridad y el SQL reales. */
@AutoConfigureMockMvc
class SanctionIT extends PostgisIntegrationTest {

    private static final String PASSWORD = "secret-123";
    private static final String URL = "/api/v1/sanctions";

    @Autowired
    private MockMvc mvc;
    @Autowired
    private ObjectMapper json;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private PasswordHasherPort passwordHasher;

    private String companyCode;
    private String suffix;
    private UUID employeeId;

    @BeforeEach
    void seed() {
        UUID tenantId = UUID.randomUUID();
        suffix = tenantId.toString().substring(0, 8);
        companyCode = "SN-" + suffix;
        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, 'Empresa de prueba')", tenantId, companyCode);
        jdbc.update("INSERT INTO company_settings (company_id) VALUES (?)", tenantId);
        jdbc.update("INSERT INTO company_capacity (company_id) VALUES (?)", tenantId);

        assignRole(seedUser(tenantId, "sup", "Sara", "SUP-" + suffix), "SUPERVISOR");
        assignRole(seedUser(tenantId, "hr", "Hugo", "HR-" + suffix), "HR_ADMIN");
        employeeId = seedUser(tenantId, "emp", "Ada", "EMP-" + suffix);
        assignRole(employeeId, "EMPLOYEE");
    }

    @Test
    void supervisorAbreSanciones_rrhhAnula_yElColaboradorLasVe() throws Exception {
        String sup = token("sup");

        mvc.perform(post(URL).header(HttpHeaders.AUTHORIZATION, "Bearer " + sup)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "userId", employeeId.toString(), "type", "WRITTEN_WARNING", "reason", "TARDINESS",
                                "incidentDate", "2026-11-20", "description", "Tres retardos en la semana"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.userName").value("Ada Lovelace"))
                .andExpect(jsonPath("$.issuedByName").value("Sara Lovelace"));

        // Suspensión sin días → 400; con inicio y días calcula el fin.
        mvc.perform(post(URL).header(HttpHeaders.AUTHORIZATION, "Bearer " + sup)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "userId", employeeId.toString(), "type", "SUSPENSION", "reason", "MISCONDUCT",
                                "incidentDate", "2026-11-21", "description", "Riña", "suspensionStart", "2026-11-23"))))
                .andExpect(status().isBadRequest());
        String suspension = json.readTree(mvc.perform(post(URL).header(HttpHeaders.AUTHORIZATION, "Bearer " + sup)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "userId", employeeId.toString(), "type", "SUSPENSION", "reason", "MISCONDUCT",
                                "incidentDate", "2026-11-21", "description", "Riña en el área de trabajo",
                                "suspensionStart", "2026-11-23", "suspensionDays", 3))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.suspensionEnd").value("2026-11-25"))
                .andReturn().getResponse().getContentAsString()).get("id").asText();

        // Bandeja: filtro por tipo y búsqueda por número.
        mvc.perform(get(URL).param("type", "SUSPENSION").param("search", "emp-" + suffix)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + sup))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));

        // RR. HH. anula (con motivo obligatorio); dos veces → 409.
        String hr = token("hr");
        mvc.perform(patch(URL + "/" + suspension + "/void").header(HttpHeaders.AUTHORIZATION, "Bearer " + hr)
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("reason", ""))))
                .andExpect(status().isBadRequest());
        mvc.perform(patch(URL + "/" + suspension + "/void").header(HttpHeaders.AUTHORIZATION, "Bearer " + hr)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("reason", "Se revisó el video"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("VOIDED"))
                .andExpect(jsonPath("$.voidedByName").value("Hugo Lovelace"));
        mvc.perform(patch(URL + "/" + suspension + "/void").header(HttpHeaders.AUTHORIZATION, "Bearer " + hr)
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("reason", "otra"))))
                .andExpect(status().isConflict());

        mvc.perform(get(URL + "/report").param("status", "ACTIVE").header(HttpHeaders.AUTHORIZATION, "Bearer " + hr))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));

        // El colaborador ve las suyas, pero no la bandeja.
        String emp = token("emp");
        mvc.perform(get("/api/v1/me/sanctions").header(HttpHeaders.AUTHORIZATION, "Bearer " + emp))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
        mvc.perform(get(URL).header(HttpHeaders.AUTHORIZATION, "Bearer " + emp))
                .andExpect(status().isForbidden());
    }

    private UUID seedUser(UUID tenant, String alias, String firstName, String code) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, employee_code) "
                        + "VALUES (?, ?, ?, ?, ?, 'Lovelace', ?)",
                id, tenant, alias + "-" + suffix + "@example.com", passwordHasher.hash(PASSWORD), firstName, code);
        return id;
    }

    private void assignRole(UUID userId, String role) {
        UUID roleId = jdbc.queryForObject(
                "SELECT id FROM roles WHERE tenant_id IS NULL AND code = ?", UUID.class, role);
        jdbc.update("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", userId, roleId);
    }

    private String token(String alias) throws Exception {
        String body = json.writeValueAsString(Map.of(
                "email", alias + "-" + suffix + "@example.com", "password", PASSWORD, "companyCode", companyCode));
        String response = mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(response).get("accessToken").asText();
    }
}
