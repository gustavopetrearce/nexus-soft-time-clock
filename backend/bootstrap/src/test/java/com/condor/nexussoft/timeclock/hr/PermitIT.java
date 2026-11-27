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

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Permisos (V32) con la seguridad y el SQL reales: un supervisor registra, solo RR. HH. decide el
 * goce de sueldo, el reporte de incapacidades filtra lo suyo y el colaborador ve sus permisos.
 */
@AutoConfigureMockMvc
class PermitIT extends PostgisIntegrationTest {

    private static final String PASSWORD = "secret-123";
    private static final String URL = "/api/v1/permits";

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
        companyCode = "PM-" + suffix;
        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, 'Empresa de prueba')", tenantId, companyCode);
        jdbc.update("INSERT INTO company_settings (company_id) VALUES (?)", tenantId);
        jdbc.update("INSERT INTO company_capacity (company_id) VALUES (?)", tenantId);

        assignRole(seedUser(tenantId, "sup", "Sara", "SUP-" + suffix), "SUPERVISOR");
        assignRole(seedUser(tenantId, "hr", "Hugo", "HR-" + suffix), "HR_ADMIN");
        employeeId = seedUser(tenantId, "emp", "Ada", "EMP-" + suffix);
        assignRole(employeeId, "EMPLOYEE");
    }

    @Test
    void supervisorRegistra_rrhhDecideGoce_yElReporteDeIncapacidadesLoMuestra() throws Exception {
        String sup = token("sup");
        String hr = token("hr");

        // El supervisor registra una incapacidad; nace aprobada y pendiente de goce.
        JsonNode created = json.readTree(mvc.perform(post(URL).header(HttpHeaders.AUTHORIZATION, "Bearer " + sup)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "userId", employeeId.toString(), "type", "ABSENCE", "reason", "INCAPACIDAD",
                                "startDate", "2026-11-16", "endDate", "2026-11-20"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.payStatus").value("PENDING_REVIEW"))
                .andExpect(jsonPath("$.days").value(5))
                .andExpect(jsonPath("$.userName").value("Ada Lovelace"))
                .andExpect(jsonPath("$.grantedByName").value("Sara Lovelace"))
                .andReturn().getResponse().getContentAsString());
        String id = created.get("id").asText();

        // El supervisor no puede decidir el goce, ni en el alta ni después.
        mvc.perform(patch(URL + "/" + id + "/pay").header(HttpHeaders.AUTHORIZATION, "Bearer " + sup)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"payStatus\":\"WITH_PAY\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post(URL).header(HttpHeaders.AUTHORIZATION, "Bearer " + sup)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "userId", employeeId.toString(), "type", "LATE_ARRIVAL", "reason", "PERSONAL",
                                "startDate", "2026-11-23", "timeAt", "10:00", "payStatus", "WITH_PAY"))))
                .andExpect(status().isForbidden());

        // Traslape del mismo tipo → 409.
        mvc.perform(post(URL).header(HttpHeaders.AUTHORIZATION, "Bearer " + sup)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "userId", employeeId.toString(), "type", "ABSENCE", "reason", "PERSONAL",
                                "startDate", "2026-11-18", "endDate", "2026-11-18"))))
                .andExpect(status().isConflict());

        // RR. HH. revisa el permiso que aprobó el supervisor y decide con goce.
        mvc.perform(patch(URL + "/" + id + "/pay").header(HttpHeaders.AUTHORIZATION, "Bearer " + hr)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"payStatus\":\"WITH_PAY\",\"note\":\"IMSS\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.payStatus").value("WITH_PAY"))
                .andExpect(jsonPath("$.payDecidedByName").value("Hugo Lovelace"))
                .andExpect(jsonPath("$.grantedByName").value("Sara Lovelace"));

        // Un permiso personal no aparece en incapacidades.
        mvc.perform(post(URL).header(HttpHeaders.AUTHORIZATION, "Bearer " + hr)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "userId", employeeId.toString(), "type", "EARLY_DEPARTURE", "reason", "PERSONAL",
                                "startDate", "2026-11-24", "timeAt", "15:30", "payStatus", "WITHOUT_PAY"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.payStatus").value("WITHOUT_PAY"));

        mvc.perform(get(URL + "/incapacities").header(HttpHeaders.AUTHORIZATION, "Bearer " + sup))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(id))
                .andExpect(jsonPath("$[0].payStatus").value("WITH_PAY"));

        // Bandeja: filtro por goce y búsqueda por número de empleado.
        mvc.perform(get(URL).param("payStatus", "WITHOUT_PAY").param("search", "emp-" + suffix)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + sup))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].type").value("EARLY_DEPARTURE"));

        // Cancelar es definitivo.
        mvc.perform(patch(URL + "/" + id + "/cancel").header(HttpHeaders.AUTHORIZATION, "Bearer " + sup)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"alta médica\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        mvc.perform(patch(URL + "/" + id + "/cancel").header(HttpHeaders.AUTHORIZATION, "Bearer " + sup))
                .andExpect(status().isConflict());

        // El colaborador ve los suyos, pero no la bandeja.
        String emp = token("emp");
        String mine = mvc.perform(get("/api/v1/me/permits").header(HttpHeaders.AUTHORIZATION, "Bearer " + emp))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(json.readTree(mine)).hasSize(2);
        mvc.perform(get(URL).header(HttpHeaders.AUTHORIZATION, "Bearer " + emp))
                .andExpect(status().isForbidden());
    }

    /** V36: el colaborador solicita una incapacidad con el motivo exacto; el personal la resuelve. */
    @Test
    void colaboradorSolicitaIncapacidad_supervisorAprueba_yJustificaSoloAlAprobarse() throws Exception {
        String emp = token("emp");
        String sup = token("sup");

        // Sin observaciones → 400; la columna no admite una solicitud sin motivo.
        mvc.perform(post("/api/v1/me/permits/incapacity").header(HttpHeaders.AUTHORIZATION, "Bearer " + emp)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"startDate\":\"2026-11-16\",\"endDate\":\"2026-11-17\",\"notes\":\"  \"}"))
                .andExpect(status().isBadRequest());

        JsonNode req = json.readTree(mvc.perform(post("/api/v1/me/permits/incapacity")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + emp)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "startDate", "2026-11-16", "endDate", "2026-11-17",
                                "notes", "Infección estomacal, incapacidad IMSS folio 123"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.reason").value("INCAPACIDAD"))
                .andExpect(jsonPath("$.requestedByEmployee").value(true))
                .andExpect(jsonPath("$.grantedByName").doesNotExist())
                .andReturn().getResponse().getContentAsString());
        String id = req.get("id").asText();

        // Otra solicitud que se traslapa con la pendiente → 409.
        mvc.perform(post("/api/v1/me/permits/incapacity").header(HttpHeaders.AUTHORIZATION, "Bearer " + emp)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("startDate", "2026-11-17", "notes", "otra"))))
                .andExpect(status().isConflict());

        // Pendiente: no se decide goce ni se cancela; el colaborador no puede resolverla.
        mvc.perform(patch(URL + "/" + id + "/pay").header(HttpHeaders.AUTHORIZATION, "Bearer " + token("hr"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"payStatus\":\"WITH_PAY\"}"))
                .andExpect(status().isConflict());
        mvc.perform(patch(URL + "/" + id + "/resolve").header(HttpHeaders.AUTHORIZATION, "Bearer " + emp)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"resolution\":\"APPROVED\"}"))
                .andExpect(status().isForbidden());

        // La bandeja filtra por pendientes.
        mvc.perform(get(URL).param("status", "PENDING").header(HttpHeaders.AUTHORIZATION, "Bearer " + sup))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].notes").value("Infección estomacal, incapacidad IMSS folio 123"));

        mvc.perform(patch(URL + "/" + id + "/resolve").header(HttpHeaders.AUTHORIZATION, "Bearer " + sup)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"resolution\":\"APPROVED\",\"note\":\"Comprobante recibido\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.grantedByName").value("Sara Lovelace"))
                .andExpect(jsonPath("$.resolvedByName").value("Sara Lovelace"))
                .andExpect(jsonPath("$.resolutionNote").value("Comprobante recibido"));
        mvc.perform(patch(URL + "/" + id + "/resolve").header(HttpHeaders.AUTHORIZATION, "Bearer " + sup)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"resolution\":\"REJECTED\"}"))
                .andExpect(status().isConflict());

        // Una segunda solicitud rechazada queda REJECTED y fuera del traslape.
        String second = json.readTree(mvc.perform(post("/api/v1/me/permits/incapacity")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + emp)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("startDate", "2026-11-25", "notes", "migraña"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).get("id").asText();
        mvc.perform(patch(URL + "/" + second + "/resolve").header(HttpHeaders.AUTHORIZATION, "Bearer " + sup)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"resolution\":\"REJECTED\",\"note\":\"sin comprobante\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"));
        mvc.perform(post("/api/v1/me/permits/incapacity").header(HttpHeaders.AUTHORIZATION, "Bearer " + emp)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("startDate", "2026-11-25", "notes", "migraña, con receta"))))
                .andExpect(status().isCreated());

        // El reporte de incapacidades trae el motivo exacto.
        mvc.perform(get(URL + "/incapacities").param("status", "APPROVED").header(HttpHeaders.AUTHORIZATION, "Bearer " + sup))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].notes").value("Infección estomacal, incapacidad IMSS folio 123"));
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
