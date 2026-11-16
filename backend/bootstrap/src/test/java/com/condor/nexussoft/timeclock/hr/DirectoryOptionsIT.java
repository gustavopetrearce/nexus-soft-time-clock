package com.condor.nexussoft.timeclock.hr;

import com.condor.nexussoft.timeclock.identity.domain.port.out.PasswordHasherPort;
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

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Selectores de colaboradores y centros con la seguridad real. RR. HH. y supervisión no tienen
 * {@code user:manage}: antes los formularios de permisos, vacaciones y turnos leían {@code /users},
 * recibían 403 y mostraban el selector vacío.
 */
@AutoConfigureMockMvc
class DirectoryOptionsIT extends PostgisIntegrationTest {

    private static final String PASSWORD = "secret-123";

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

    @BeforeEach
    void seed() {
        UUID tenantId = UUID.randomUUID();
        suffix = tenantId.toString().substring(0, 8);
        companyCode = "DO-" + suffix;
        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, 'Empresa de prueba')", tenantId, companyCode);
        jdbc.update("INSERT INTO company_settings (company_id) VALUES (?)", tenantId);
        jdbc.update("INSERT INTO company_capacity (company_id) VALUES (?)", tenantId);

        assignRole(seedUser(tenantId, "hr", "Hugo", "HR-" + suffix), "HR_ADMIN");
        assignRole(seedUser(tenantId, "sup", "Sara", "SUP-" + suffix), "SUPERVISOR");
        assignRole(seedUser(tenantId, "emp", "Ada", "EMP-" + suffix), "EMPLOYEE");
        UUID inactive = seedUser(tenantId, "old", "Olga", "OLD-" + suffix);
        jdbc.update("UPDATE users SET status = 'INACTIVE' WHERE id = ?", inactive);
        jdbc.update("INSERT INTO work_sites (id, tenant_id, code, name, location) "
                        + "VALUES (?, ?, ?, 'Centro', ST_SetSRID(ST_MakePoint(-99.13, 19.43), 4326)::geography)",
                UUID.randomUUID(), tenantId, "S-" + suffix);

        // Otra empresa: nunca debe aparecer.
        UUID other = UUID.randomUUID();
        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, 'Otra')", other, "DX-" + suffix);
        seedUser(other, "ajeno", "Ajeno", "AJ-" + suffix);
    }

    @Test
    void rrhhYSupervision_venLosColaboradoresSinTenerUserManage() throws Exception {
        String hr = token("hr");
        // El origen del fallo: el listado de usuarios sigue siendo solo para quien los administra.
        mvc.perform(get("/api/v1/users").header(HttpHeaders.AUTHORIZATION, "Bearer " + hr))
                .andExpect(status().isForbidden());

        assertThat(names(hr, "")).containsExactly("Ada Lovelace", "Hugo Lovelace", "Sara Lovelace");
        assertThat(names(token("sup"), "")).containsExactly("Ada Lovelace", "Hugo Lovelace", "Sara Lovelace");
    }

    @Test
    void buscaPorNombreONumeroDeEmpleado() throws Exception {
        String hr = token("hr");

        assertThat(names(hr, "?search=sara")).containsExactly("Sara Lovelace");
        assertThat(names(hr, "?search=EMP-" + suffix)).containsExactly("Ada Lovelace");
        assertThat(names(hr, "?search=%25")).isEmpty();   // el comodín se busca literal
    }

    @Test
    void centros_paraRrhh_noParaSupervision() throws Exception {
        JsonNode sites = json.readTree(mvc.perform(get("/api/v1/options/work-sites")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token("hr")))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(sites).hasSize(1);
        assertThat(sites.get(0).get("code").asText()).isEqualTo("S-" + suffix);

        mvc.perform(get("/api/v1/options/work-sites").header(HttpHeaders.AUTHORIZATION, "Bearer " + token("sup")))
                .andExpect(status().isForbidden());
    }

    @Test
    void elColaboradorNoVeElDirectorio() throws Exception {
        mvc.perform(get("/api/v1/options/employees").header(HttpHeaders.AUTHORIZATION, "Bearer " + token("emp")))
                .andExpect(status().isForbidden());
    }

    private List<String> names(String token, String query) throws Exception {
        JsonNode list = json.readTree(mvc.perform(get("/api/v1/options/employees" + query)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        List<String> out = new ArrayList<>();
        list.forEach(n -> {
            assertThat(n.has("email")).isFalse();   // solo id, nombre y número
            out.add(n.get("fullName").asText());
        });
        return out;
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
