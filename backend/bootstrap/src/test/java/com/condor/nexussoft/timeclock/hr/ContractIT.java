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

import java.sql.Date;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Contratos (V33) con la seguridad y el SQL reales: RR. HH. registra contratos por proyecto y por
 * turno, el traslape se rechaza, el proyecto acota la vigencia, el cambio posterior del proyecto
 * marca el contrato "por revisar" y la BD rechaza proyectos con fechas invertidas.
 */
@AutoConfigureMockMvc
class ContractIT extends PostgisIntegrationTest {

    private static final String PASSWORD = "secret-123";
    private static final String URL = "/api/v1/contracts";

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
    private UUID projectId;

    @BeforeEach
    void seed() {
        UUID tenantId = UUID.randomUUID();
        suffix = tenantId.toString().substring(0, 8);
        companyCode = "CT-" + suffix;
        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, 'Empresa de prueba')", tenantId, companyCode);
        jdbc.update("INSERT INTO company_settings (company_id) VALUES (?)", tenantId);
        jdbc.update("INSERT INTO company_capacity (company_id) VALUES (?)", tenantId);

        assignRole(seedUser(tenantId, "hr", "Hugo", "HR-" + suffix), "HR_ADMIN");
        assignRole(seedUser(tenantId, "sup", "Sara", "SUP-" + suffix), "SUPERVISOR");
        employeeId = seedUser(tenantId, "emp", "Ada", "EMP-" + suffix);
        assignRole(employeeId, "EMPLOYEE");

        projectId = UUID.randomUUID();
        jdbc.update("INSERT INTO projects (id, tenant_id, code, name, starts_on, ends_on) VALUES (?, ?, ?, 'Obra Norte', ?, ?)",
                projectId, tenantId, "OBRA-" + suffix, Date.valueOf("2026-01-01"), Date.valueOf("2026-12-31"));
    }

    @Test
    void rrhhRegistraPorProyectoYPorTurno_sinTraslapes_yElCambioDelProyectoSeSenala() throws Exception {
        String hr = token("hr");

        // Opciones del formulario con contract:manage (RR. HH. no tiene user:manage).
        mvc.perform(get(URL + "/options").header(HttpHeaders.AUTHORIZATION, "Bearer " + hr))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.projects[0].code").value("OBRA-" + suffix))
                .andExpect(jsonPath("$.collaborators.length()").value(3));

        // Por proyecto sin fin: hereda el fin del proyecto.
        String created = mvc.perform(post(URL).header(HttpHeaders.AUTHORIZATION, "Bearer " + hr)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("PROJECT", projectId, "2026-03-01", null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("PROJECT"))
                .andExpect(jsonPath("$.endsOn").value("2026-12-31"))
                .andExpect(jsonPath("$.projectCode").value("OBRA-" + suffix))
                .andExpect(jsonPath("$.userName").value("Ada Lovelace"))
                .andExpect(jsonPath("$.createdByName").value("Hugo Lovelace"))
                .andExpect(jsonPath("$.needsReview").value(false))
                .andReturn().getResponse().getContentAsString();
        String projectContract = json.readTree(created).get("id").asText();

        // Fuera de la vigencia del proyecto → 400.
        mvc.perform(post(URL).header(HttpHeaders.AUTHORIZATION, "Bearer " + hr)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("PROJECT", projectId, "2025-12-01", "2026-01-31")))
                .andExpect(status().isBadRequest());

        // Traslape con el contrato por proyecto → 409.
        mvc.perform(post(URL).header(HttpHeaders.AUTHORIZATION, "Bearer " + hr)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("SHIFT", null, "2026-12-01", null)))
                .andExpect(status().isConflict());

        // Terminar el de proyecto en junio deja libre el resto del año para uno por turno indefinido.
        mvc.perform(patch(URL + "/" + projectContract + "/end").header(HttpHeaders.AUTHORIZATION, "Bearer " + hr)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"endDate\":\"2026-06-30\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ENDED"))
                .andExpect(jsonPath("$.endsOn").value("2026-06-30"));
        mvc.perform(post(URL).header(HttpHeaders.AUTHORIZATION, "Bearer " + hr)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("SHIFT", null, "2026-07-01", null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.endsOn").doesNotExist());

        // Editar el terminado no se permite.
        mvc.perform(put(URL + "/" + projectContract).header(HttpHeaders.AUTHORIZATION, "Bearer " + hr)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"startsOn\":\"2026-03-01\"}"))
                .andExpect(status().isConflict());

        // El proyecto se acorta a mayo: el contrato (hasta junio) queda por revisar.
        jdbc.update("UPDATE projects SET ends_on = ? WHERE id = ?", Date.valueOf("2026-05-31"), projectId);
        mvc.perform(get("/api/v1/users/" + employeeId + "/contracts").header(HttpHeaders.AUTHORIZATION, "Bearer " + hr))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].type").value("SHIFT"))
                .andExpect(jsonPath("$[1].needsReview").value(true));

        // Listado: filtro por proyecto y vigente en una fecha.
        mvc.perform(get(URL).param("projectId", projectId.toString()).header(HttpHeaders.AUTHORIZATION, "Bearer " + hr))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get(URL).param("activeOn", "2026-08-15").param("search", "emp-" + suffix)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + hr))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].type").value("SHIFT"));

        // Cancelar exige causa (400 por validación) y es definitivo.
        mvc.perform(patch(URL + "/" + projectContract + "/cancel").header(HttpHeaders.AUTHORIZATION, "Bearer " + hr)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\" \"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch(URL + "/" + projectContract + "/cancel").header(HttpHeaders.AUTHORIZATION, "Bearer " + hr)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Capturado por error\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));

        // Un supervisor no administra contratos.
        mvc.perform(get(URL).header(HttpHeaders.AUTHORIZATION, "Bearer " + token("sup")))
                .andExpect(status().isForbidden());
    }

    @Test
    void laBdRechazaTraslapesYProyectosConFechasInvertidas() {
        UUID tenant = jdbc.queryForObject("SELECT tenant_id FROM users WHERE id = ?", UUID.class, employeeId);
        jdbc.update("INSERT INTO employment_contracts (tenant_id, user_id, contract_type, starts_on) VALUES (?, ?, 'SHIFT', ?)",
                tenant, employeeId, Date.valueOf(LocalDate.of(2026, 1, 1)));

        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO employment_contracts (tenant_id, user_id, contract_type, starts_on) VALUES (?, ?, 'SHIFT', ?)",
                tenant, employeeId, Date.valueOf(LocalDate.of(2027, 1, 1))))
                .hasMessageContaining("ex_contracts_no_overlap");
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO employment_contracts (tenant_id, user_id, contract_type, starts_on) VALUES (?, ?, 'PROJECT', ?)",
                tenant, employeeId, Date.valueOf(LocalDate.of(2030, 1, 1))))
                .hasMessageContaining("ck_contracts_project");
        assertThatThrownBy(() -> jdbc.update("UPDATE projects SET ends_on = ? WHERE id = ?",
                Date.valueOf("2025-01-01"), projectId))
                .hasMessageContaining("ck_projects_range");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM employment_contracts WHERE user_id = ?",
                Integer.class, employeeId)).isEqualTo(1);
    }

    /** El colaborador ve su contrato vigente desde la app (fase 3); sin contrato, 204. */
    @Test
    void elColaboradorVeSuContratoVigente() throws Exception {
        String emp = token("emp");
        mvc.perform(get("/api/v1/me/contract").header(HttpHeaders.AUTHORIZATION, "Bearer " + emp))
                .andExpect(status().isNoContent());

        LocalDate today = LocalDate.now();
        UUID tenant = jdbc.queryForObject("SELECT tenant_id FROM users WHERE id = ?", UUID.class, employeeId);
        jdbc.update("UPDATE projects SET starts_on = ?, ends_on = ? WHERE id = ?",
                Date.valueOf(today.minusDays(100)), Date.valueOf(today.plusDays(100)), projectId);
        jdbc.update("INSERT INTO employment_contracts (tenant_id, user_id, contract_type, project_id, starts_on, ends_on) "
                        + "VALUES (?, ?, 'PROJECT', ?, ?, ?)",
                tenant, employeeId, projectId, Date.valueOf(today.minusDays(10)), Date.valueOf(today.plusDays(10)));

        mvc.perform(get("/api/v1/me/contract").header(HttpHeaders.AUTHORIZATION, "Bearer " + emp))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("PROJECT"))
                .andExpect(jsonPath("$.projectCode").value("OBRA-" + suffix))
                .andExpect(jsonPath("$.projectName").value("Obra Norte"))
                .andExpect(jsonPath("$.current").value(true));
    }

    private String body(String type, UUID project, String start, String end) throws Exception {
        Map<String, Object> m = new HashMap<>();
        m.put("userId", employeeId.toString());
        m.put("type", type);
        if (project != null) m.put("projectId", project.toString());
        m.put("startsOn", start);
        if (end != null) m.put("endsOn", end);
        return json.writeValueAsString(m);
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
