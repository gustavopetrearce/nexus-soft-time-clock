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

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cancelación de vacaciones a petición del colaborador (V37), con la seguridad y el SQL reales:
 * la pide el dueño con motivo, RR. HH. la acepta o deniega, REJECTED ≠ CANCELLED y los días
 * cancelados se liberan para una nueva solicitud.
 */
@AutoConfigureMockMvc
class VacationCancellationIT extends PostgisIntegrationTest {

    private static final String PASSWORD = "secret-123";
    private static final String REQUESTS = "/api/v1/vacations/requests";

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
    /** Lunes dentro de unas semanas: siempre futuro, con días hábiles. */
    private final LocalDate monday = LocalDate.now().plusWeeks(3).with(TemporalAdjusters.next(DayOfWeek.MONDAY));

    @BeforeEach
    void seed() {
        UUID tenantId = UUID.randomUUID();
        suffix = tenantId.toString().substring(0, 8);
        companyCode = "VC-" + suffix;
        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, 'Empresa de prueba')", tenantId, companyCode);
        jdbc.update("INSERT INTO company_settings (company_id) VALUES (?)", tenantId);
        jdbc.update("INSERT INTO company_capacity (company_id) VALUES (?)", tenantId);

        assignRole(seedUser(tenantId, "hr", "Hugo", "HR-" + suffix), "HR_ADMIN");
        assignRole(seedUser(tenantId, "emp", "Ada", "EMP-" + suffix), "EMPLOYEE");
        assignRole(seedUser(tenantId, "otro", "Otto", "OT-" + suffix), "EMPLOYEE");
    }

    @Test
    void pendiente_colaboradorPideCancelar_rrhhAcepta_yLosDiasSeLiberan() throws Exception {
        String emp = token("emp");
        String hr = token("hr");
        String id = createRequest(emp, monday, monday.plusDays(4));

        // Sin motivo → 400; otro colaborador → 404.
        mvc.perform(post("/api/v1/me/vacations/" + id + "/cancellation").header(HttpHeaders.AUTHORIZATION, "Bearer " + emp)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\" \"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/me/vacations/" + id + "/cancellation").header(HttpHeaders.AUTHORIZATION, "Bearer " + token("otro"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"x\"}"))
                .andExpect(status().isNotFound());

        mvc.perform(post("/api/v1/me/vacations/" + id + "/cancellation").header(HttpHeaders.AUTHORIZATION, "Bearer " + emp)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Quiero reagendar\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.cancelRequestStatus").value("PENDING"))
                .andExpect(jsonPath("$.canRequestCancellation").value(false));
        // Dos veces → 409.
        mvc.perform(post("/api/v1/me/vacations/" + id + "/cancellation").header(HttpHeaders.AUTHORIZATION, "Bearer " + emp)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"otra vez\"}"))
                .andExpect(status().isConflict());

        // La bandeja filtra las que tienen cancelación pedida.
        mvc.perform(get(REQUESTS).param("cancellation", "PENDING").header(HttpHeaders.AUTHORIZATION, "Bearer " + hr))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].cancelRequestReason").value("Quiero reagendar"));

        // El colaborador no resuelve; RR. HH. acepta.
        mvc.perform(patch(REQUESTS + "/" + id + "/cancellation/resolve").header(HttpHeaders.AUTHORIZATION, "Bearer " + emp)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"resolution\":\"ACCEPTED\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(patch(REQUESTS + "/" + id + "/cancellation/resolve").header(HttpHeaders.AUTHORIZATION, "Bearer " + hr)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"resolution\":\"ACCEPTED\",\"note\":\"De acuerdo\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.cancelRequestStatus").value("ACCEPTED"))
                .andExpect(jsonPath("$.cancelResolvedByName").value("Hugo Lovelace"));

        // Ya cancelada: no se aprueba ni se vuelve a resolver la cancelación.
        mvc.perform(patch(REQUESTS + "/" + id + "/resolve").header(HttpHeaders.AUTHORIZATION, "Bearer " + hr)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"resolution\":\"APPROVED\"}"))
                .andExpect(status().isConflict());

        // Los días quedaron libres: el mismo periodo se vuelve a solicitar.
        createRequest(emp, monday, monday.plusDays(4));
    }

    @Test
    void aprobada_rrhhDeniegaLaCancelacion_yLuegoLaAcepta_rechazadaEsDistinta() throws Exception {
        String emp = token("emp");
        String hr = token("hr");

        String approved = createRequest(emp, monday, monday.plusDays(1));
        resolve(hr, approved, "APPROVED");
        mvc.perform(post("/api/v1/me/vacations/" + approved + "/cancellation").header(HttpHeaders.AUTHORIZATION, "Bearer " + emp)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Cambio de fecha\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"));
        mvc.perform(patch(REQUESTS + "/" + approved + "/cancellation/resolve").header(HttpHeaders.AUTHORIZATION, "Bearer " + hr)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"resolution\":\"DENIED\",\"note\":\"Temporada alta\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.cancelRequestStatus").value("DENIED"))
                .andExpect(jsonPath("$.cancelResolutionNote").value("Temporada alta"))
                .andExpect(jsonPath("$.canRequestCancellation").value(true));

        // Una pendiente con cancelación en curso que la empresa rechaza queda REJECTED, no CANCELLED.
        String rejected = createRequest(emp, monday.plusWeeks(2), monday.plusWeeks(2).plusDays(1));
        mvc.perform(post("/api/v1/me/vacations/" + rejected + "/cancellation").header(HttpHeaders.AUTHORIZATION, "Bearer " + emp)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Ya no viajo\"}"))
                .andExpect(status().isOk());
        mvc.perform(patch(REQUESTS + "/" + rejected + "/resolve").header(HttpHeaders.AUTHORIZATION, "Bearer " + hr)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"resolution\":\"REJECTED\",\"note\":\"Sin cobertura\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.cancelRequestStatus").value("DENIED"));

        mvc.perform(get("/api/v1/me/vacations").header(HttpHeaders.AUTHORIZATION, "Bearer " + emp))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }

    private String createRequest(String token, LocalDate start, LocalDate end) throws Exception {
        String body = mvc.perform(post(REQUESTS).header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("startDate", start.toString(), "endDate", end.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("id").asText();
    }

    private void resolve(String token, String id, String resolution) throws Exception {
        mvc.perform(patch(REQUESTS + "/" + id + "/resolve").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"resolution\":\"" + resolution + "\"}"))
                .andExpect(status().isOk());
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
