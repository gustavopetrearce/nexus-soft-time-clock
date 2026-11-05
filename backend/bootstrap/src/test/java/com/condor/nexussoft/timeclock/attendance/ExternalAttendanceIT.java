package com.condor.nexussoft.timeclock.attendance;

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
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Flujo real de una integración (ADR-013), de la credencial a la fila en la tabla particionada, con
 * las reglas de seguridad reales: lo que de verdad protege este canal —el confinamiento del token de
 * sistema— vive en {@code SecurityConfig} y no se ve con mocks.
 */
@AutoConfigureMockMvc
class ExternalAttendanceIT extends PostgisIntegrationTest {

    private static final String PASSWORD = "secret-123";
    private static final String ATTENDANCE_URL = "/api/v1/integrations/attendance";
    private static final String CLIENTS_URL = "/api/v1/integrations/clients";
    private static final String USERS_URL = "/api/v1/integrations/users";

    @Autowired
    private MockMvc mvc;
    @Autowired
    private ObjectMapper json;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private PasswordHasherPort passwordHasher;

    private UUID tenantId;
    private String companyCode;
    private String adminEmail;
    private String employeeCode;
    private UUID employeeId;
    private UUID siteId;

    @BeforeEach
    void seed() {
        tenantId = UUID.randomUUID();
        String suffix = tenantId.toString().substring(0, 8);
        companyCode = "IT-" + suffix;
        seedCompany(tenantId, companyCode);

        adminEmail = "admin-" + suffix + "@example.com";
        UUID adminId = seedUser(tenantId, adminEmail, null);
        assignRole(adminId, "COMPANY_ADMIN");

        employeeCode = "EMP-" + suffix;
        employeeId = seedUser(tenantId, "emp-" + suffix + "@example.com", employeeCode);
        assignRole(employeeId, "EMPLOYEE");

        siteId = seedSite(tenantId, "S-" + suffix);
    }

    private void seedCompany(UUID id, String code) {
        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, 'Empresa de prueba')", id, code);
        jdbc.update("INSERT INTO company_settings (company_id) VALUES (?)", id);
        jdbc.update("INSERT INTO company_capacity (company_id) VALUES (?)", id);
    }

    private UUID seedUser(UUID tenant, String email, String code) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, employee_code) "
                        + "VALUES (?, ?, ?, ?, 'Ada', 'Lovelace', ?)",
                id, tenant, email, passwordHasher.hash(PASSWORD), code);
        return id;
    }

    private void assignRole(UUID userId, String role) {
        UUID roleId = jdbc.queryForObject(
                "SELECT id FROM roles WHERE tenant_id IS NULL AND code = ?", UUID.class, role);
        jdbc.update("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", userId, roleId);
    }

    private UUID seedSite(UUID tenant, String code) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO work_sites (id, tenant_id, code, name, location) "
                        + "VALUES (?, ?, ?, 'Centro', ST_SetSRID(ST_MakePoint(-99.13, 19.43), 4326)::geography)",
                id, tenant, code);
        return id;
    }

    private String adminToken() throws Exception {
        String body = json.writeValueAsString(java.util.Map.of(
                "email", adminEmail, "password", PASSWORD, "companyCode", companyCode));
        String response = mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(response).get("accessToken").asText();
    }

    private JsonNode createClient(String adminToken) throws Exception {
        String response = mvc.perform(post(CLIENTS_URL)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"ERP\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(response);
    }

    private ResultActions requestToken(String clientId, String secret) throws Exception {
        return mvc.perform(post("/api/v1/oauth/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("grant_type", "client_credentials")
                .param("client_id", clientId)
                .param("client_secret", secret));
    }

    private String clientToken() throws Exception {
        JsonNode client = createClient(adminToken());
        String response = requestToken(client.get("clientId").asText(), client.get("clientSecret").asText())
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(response).get("access_token").asText();
    }

    private String marca(UUID operation, String code, UUID site, String eventType, Instant eventTime) {
        return "{\"operationUuid\":\"" + operation + "\",\"employeeCode\":\"" + code + "\",\"workSiteId\":\"" + site
                + "\",\"eventType\":\"" + eventType + "\",\"eventTime\":\"" + eventTime + "\"}";
    }

    private ResultActions postAttendance(String token, String body) throws Exception {
        return mvc.perform(post(ATTENDANCE_URL)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    @Test
    void flujoCompleto_credencialTokenMarcaReenvioYRevocacion() throws Exception {
        String admin = adminToken();
        JsonNode client = createClient(admin);
        String clientId = client.get("clientId").asText();
        String secret = client.get("clientSecret").asText();

        String stored = jdbc.queryForObject(
                "SELECT secret_hash FROM api_clients WHERE client_id = ?", String.class, clientId);
        assertThat(stored).isNotEqualTo(secret);

        String token = json.readTree(requestToken(clientId, secret)
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.token_type").value("Bearer"))
                        .andExpect(jsonPath("$.expires_in").isNumber())
                        .andReturn().getResponse().getContentAsString())
                .get("access_token").asText();

        Instant eventTime = Instant.now().minus(10, ChronoUnit.MINUTES).truncatedTo(ChronoUnit.SECONDS);
        UUID operation = UUID.randomUUID();
        String body = marca(operation, employeeCode, siteId, "ENTRADA", eventTime);

        String first = postAttendance(token, body)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACCEPTED"))
                .andReturn().getResponse().getContentAsString();

        var row = jdbc.queryForMap("SELECT server_time, user_id, source, location, gps_accuracy_m, created_at "
                + "FROM attendance_records WHERE tenant_id = ?", tenantId);
        assertThat(((java.sql.Timestamp) row.get("server_time")).toInstant()).isEqualTo(eventTime);
        assertThat(row.get("user_id")).isEqualTo(employeeId);
        assertThat(row.get("source")).isEqualTo("EXTERNAL");
        assertThat(row.get("location")).isNull();
        assertThat(row.get("gps_accuracy_m")).isNull();
        assertThat(((java.sql.Timestamp) row.get("created_at")).toInstant()).isAfter(eventTime);

        // Reenvío: misma respuesta y ninguna fila nueva.
        String replay = postAttendance(token, body)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(json.readTree(replay).get("recordId")).isEqualTo(json.readTree(first).get("recordId"));
        assertThat(countRecords()).isEqualTo(1);

        // Las lecturas no se rompen con una fila sin GPS.
        mvc.perform(get("/api/v1/reports/attendance-events")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].source").value("EXTERNAL"))
                .andExpect(jsonPath("$[0].gpsAccuracyM").doesNotExist());

        // La revocación corta de inmediato aunque el JWT siga vigente.
        String clientUuid = client.get("id").asText();
        mvc.perform(delete(CLIENTS_URL + "/" + clientUuid).header(HttpHeaders.AUTHORIZATION, "Bearer " + admin))
                .andExpect(status().isNoContent());
        postAttendance(token, marca(UUID.randomUUID(), employeeCode, siteId, "SALIDA", Instant.now()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("API_CLIENT_REVOKED"));
        requestToken(clientId, secret)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("invalid_client"));
    }

    private String basic(String clientId, String secret) {
        return "Basic " + Base64.getEncoder().encodeToString((clientId + ":" + secret).getBytes());
    }

    private ResultActions postAttendanceBasic(String authorization, String body) throws Exception {
        return mvc.perform(post(ATTENDANCE_URL)
                .header(HttpHeaders.AUTHORIZATION, authorization)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    /** El reloj solo envía una cabecera fija: ninguna de estas peticiones pide token. */
    @Test
    void relojConCabeceraFija_marcaSinPedirToken() throws Exception {
        JsonNode client = createClient(adminToken());
        String header = basic(client.get("clientId").asText(), client.get("clientSecret").asText());
        Instant start = Instant.now().minus(2, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS);

        postAttendanceBasic(header, marca(UUID.randomUUID(), employeeCode, siteId, "ENTRADA", start))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACCEPTED"));
        // La misma cabecera sigue valiendo en la siguiente marca.
        postAttendanceBasic(header, marca(UUID.randomUUID(), employeeCode, siteId, "SALIDA", start.plus(1, ChronoUnit.HOURS)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACCEPTED"));

        var row = jdbc.queryForMap("SELECT user_id, source, location, validations_json::text AS validations "
                + "FROM attendance_records WHERE tenant_id = ? ORDER BY server_time LIMIT 1", tenantId);
        assertThat(row.get("user_id")).isEqualTo(employeeId);
        assertThat(row.get("source")).isEqualTo("EXTERNAL");
        assertThat(row.get("location")).isNull();
        assertThat((String) row.get("validations")).contains(client.get("id").asText());

        // La marca queda atribuida a la integración, no a un usuario ni al vacío.
        String actor = jdbc.queryForObject("SELECT actor_email FROM outbox_events WHERE tenant_id = ? "
                + "AND event_type = 'AttendanceRegistered' LIMIT 1", String.class, tenantId);
        assertThat(actor).isEqualTo("integration:ERP");

        var lastUsed = jdbc.queryForObject("SELECT last_used_at FROM api_clients WHERE client_id = ?",
                java.sql.Timestamp.class, client.get("clientId").asText());
        assertThat(lastUsed).isNotNull();
    }

    @Test
    void cabeceraFijaInvalida_da401ConDesafioBasic() throws Exception {
        JsonNode client = createClient(adminToken());
        String body = marca(UUID.randomUUID(), employeeCode, siteId, "ENTRADA", Instant.now());

        for (String header : new String[]{
                basic(client.get("clientId").asText(), "incorrecto"),
                basic("nxc_inexistente", client.get("clientSecret").asText()),
                basic(adminEmail, PASSWORD),
                "Basic no-es-base64!"}) {
            postAttendanceBasic(header, body)
                    .andExpect(status().isUnauthorized())
                    .andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, "Basic"))
                    .andExpect(jsonPath("$.code").value("INVALID_CLIENT"));
        }
        assertThat(countRecords()).isZero();
    }

    @Test
    void rotarYRevocar_cortanLaCabeceraFijaAlInstante() throws Exception {
        String admin = adminToken();
        JsonNode client = createClient(admin);
        String clientId = client.get("clientId").asText();
        String oldHeader = basic(clientId, client.get("clientSecret").asText());
        Instant start = Instant.now().minus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS);

        String rotated = mvc.perform(post(CLIENTS_URL + "/" + client.get("id").asText() + "/rotate-secret")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + admin))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String newHeader = basic(clientId, json.readTree(rotated).get("clientSecret").asText());

        postAttendanceBasic(oldHeader, marca(UUID.randomUUID(), employeeCode, siteId, "ENTRADA", start))
                .andExpect(status().isUnauthorized());
        postAttendanceBasic(newHeader, marca(UUID.randomUUID(), employeeCode, siteId, "ENTRADA", start))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACCEPTED"));

        mvc.perform(delete(CLIENTS_URL + "/" + client.get("id").asText())
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + admin))
                .andExpect(status().isNoContent());
        postAttendanceBasic(newHeader, marca(UUID.randomUUID(), employeeCode, siteId, "SALIDA", start.plus(10, ChronoUnit.MINUTES)))
                .andExpect(status().isUnauthorized());
    }

    /** La cabecera fija solo abre la marcación: fuera de ella no autentica a nadie. */
    @Test
    void cabeceraFija_noSirveEnOtrasRutas() throws Exception {
        JsonNode client = createClient(adminToken());
        String header = basic(client.get("clientId").asText(), client.get("clientSecret").asText());

        for (String url : new String[]{"/api/v1/users?page=0&size=10", "/api/v1/auth/me",
                "/api/v1/attendance/me", CLIENTS_URL}) {
            mvc.perform(get(url).header(HttpHeaders.AUTHORIZATION, header))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Test
    void token_aceptaHttpBasic() throws Exception {
        JsonNode client = createClient(adminToken());
        String basic = Base64.getEncoder().encodeToString(
                (client.get("clientId").asText() + ":" + client.get("clientSecret").asText()).getBytes());

        mvc.perform(post("/api/v1/oauth/token")
                        .header(HttpHeaders.AUTHORIZATION, "Basic " + basic)
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("grant_type", "client_credentials"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.access_token").isNotEmpty());
    }

    @Test
    void token_conGrantNoSoportado_oSecretoIncorrecto() throws Exception {
        JsonNode client = createClient(adminToken());

        mvc.perform(post("/api/v1/oauth/token")
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("grant_type", "password"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("unsupported_grant_type"));

        requestToken(client.get("clientId").asText(), "incorrecto")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("invalid_client"));
    }

    @Test
    void tokenDeCliente_quedaConfinadoASuEndpoint() throws Exception {
        String token = clientToken();

        for (String url : new String[]{"/api/v1/users?page=0&size=10", "/api/v1/auth/me",
                "/api/v1/attendance/me", CLIENTS_URL}) {
            mvc.perform(get(url).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                    .andExpect(status().isForbidden());
        }
    }

    @Test
    void tokenDeUsuario_noPuedeUsarLaMarcacionExterna() throws Exception {
        postAttendance(adminToken(), marca(UUID.randomUUID(), employeeCode, siteId, "ENTRADA", Instant.now()))
                .andExpect(status().isForbidden());
    }

    @Test
    void sinToken_recibe401() throws Exception {
        mvc.perform(post(ATTENDANCE_URL).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void colaboradorYCentroDeOtraEmpresa_noSeAlcanzan() throws Exception {
        String token = clientToken();

        UUID otherTenant = UUID.randomUUID();
        String suffix = otherTenant.toString().substring(0, 8);
        seedCompany(otherTenant, "IT-" + suffix);
        String otherCode = "EMP-" + suffix;
        assignRole(seedUser(otherTenant, "emp-" + suffix + "@example.com", otherCode), "EMPLOYEE");
        UUID otherSite = seedSite(otherTenant, "S-" + suffix);

        postAttendance(token, marca(UUID.randomUUID(), otherCode, siteId, "ENTRADA", Instant.now()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("EMPLOYEE_NOT_FOUND"));
        postAttendance(token, marca(UUID.randomUUID(), employeeCode, otherSite, "ENTRADA", Instant.now()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("WORK_SITE_NOT_FOUND"));
        assertThat(countRecords()).isZero();
    }

    @Test
    void jornadaCompleta_yMarcaTardiaFueraDeOrden() throws Exception {
        String token = clientToken();
        Instant start = Instant.now().minus(8, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS);

        postAttendance(token, marca(UUID.randomUUID(), employeeCode, siteId, "ENTRADA", start))
                .andExpect(jsonPath("$.status").value("ACCEPTED"));
        postAttendance(token, marca(UUID.randomUUID(), employeeCode, siteId, "SALIDA", start.plus(7, ChronoUnit.HOURS)))
                .andExpect(jsonPath("$.status").value("ACCEPTED"));

        postAttendance(token, marca(UUID.randomUUID(), employeeCode, siteId, "INICIO_DESCANSO", start.plus(3, ChronoUnit.HOURS)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.rejectionReason").value("INVALID_SEQUENCE"));
    }

    @Test
    void fechaSinDesfase_es400YNo500() throws Exception {
        String token = clientToken();
        String body = "{\"operationUuid\":\"" + UUID.randomUUID() + "\",\"employeeCode\":\"" + employeeCode
                + "\",\"workSiteId\":\"" + siteId + "\",\"eventType\":\"ENTRADA\",\"eventTime\":\"2026-11-05T08:00:00\"}";

        postAttendance(token, body).andExpect(status().isBadRequest());
    }

    private ResultActions lookup(String authorization, String code) throws Exception {
        return mvc.perform(get(USERS_URL).param("employeeCode", code)
                .header(HttpHeaders.AUTHORIZATION, authorization));
    }

    /** El emisor comprueba el código antes de marcar, con cualquiera de las dos vías. */
    @Test
    void consultaPorCodigo_conCabeceraFijaYConToken() throws Exception {
        JsonNode client = createClient(adminToken());
        String clientId = client.get("clientId").asText();
        String secret = client.get("clientSecret").asText();
        String token = json.readTree(requestToken(clientId, secret)
                        .andReturn().getResponse().getContentAsString())
                .get("access_token").asText();

        for (String authorization : new String[]{basic(clientId, secret), "Bearer " + token}) {
            lookup(authorization, employeeCode)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(employeeId.toString()))
                    .andExpect(jsonPath("$.employeeCode").value(employeeCode))
                    .andExpect(jsonPath("$.firstName").value("Ada"))
                    .andExpect(jsonPath("$.lastName").value("Lovelace"))
                    .andExpect(jsonPath("$.status").value("ACTIVE"))
                    .andExpect(jsonPath("$.canRegisterAttendance").value(true))
                    .andExpect(jsonPath("$.email").doesNotExist())
                    .andExpect(jsonPath("$.roles").doesNotExist());
        }
    }

    @Test
    void consultaPorCodigo_inexistenteDeOtraEmpresaOParcial_da404() throws Exception {
        JsonNode client = createClient(adminToken());
        String header = basic(client.get("clientId").asText(), client.get("clientSecret").asText());

        UUID otherTenant = UUID.randomUUID();
        String suffix = otherTenant.toString().substring(0, 8);
        seedCompany(otherTenant, "IT-" + suffix);
        String otherCode = "EMP-" + suffix;
        assignRole(seedUser(otherTenant, "emp-" + suffix + "@example.com", otherCode), "EMPLOYEE");

        for (String code : new String[]{"NO-EXISTE", otherCode, employeeCode.substring(0, 6), ""}) {
            lookup(header, code)
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("NOT_FOUND"));
        }
        mvc.perform(get(USERS_URL).header(HttpHeaders.AUTHORIZATION, header))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void consultaPorCodigo_colaboradorSinPermisoDeMarcar() throws Exception {
        String code = "SIN-" + tenantId.toString().substring(0, 8);
        seedUser(tenantId, "sin-" + code + "@example.com", code);
        JsonNode client = createClient(adminToken());

        lookup(basic(client.get("clientId").asText(), client.get("clientSecret").asText()), code)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.canRegisterAttendance").value(false));
    }

    @Test
    void consultaPorCodigo_credencialRevocadaOTokenDeUsuario_noPasan() throws Exception {
        String admin = adminToken();
        JsonNode client = createClient(admin);
        String clientId = client.get("clientId").asText();
        String secret = client.get("clientSecret").asText();
        String token = json.readTree(requestToken(clientId, secret)
                        .andReturn().getResponse().getContentAsString())
                .get("access_token").asText();

        lookup("Bearer " + admin, employeeCode).andExpect(status().isForbidden());

        mvc.perform(delete(CLIENTS_URL + "/" + client.get("id").asText())
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + admin))
                .andExpect(status().isNoContent());
        lookup(basic(clientId, secret), employeeCode)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CLIENT"));
        lookup("Bearer " + token, employeeCode)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("API_CLIENT_REVOKED"));
    }

    private Integer countRecords() {
        return jdbc.queryForObject("SELECT count(*) FROM attendance_records WHERE tenant_id = ?",
                Integer.class, tenantId);
    }
}
