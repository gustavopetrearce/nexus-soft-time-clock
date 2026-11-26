package com.condor.nexussoft.timeclock.onboarding;

import com.condor.nexussoft.timeclock.identity.domain.port.in.GranterAuthority;
import com.condor.nexussoft.timeclock.onboarding.domain.ImportReport;
import com.condor.nexussoft.timeclock.onboarding.domain.ImportRow;
import com.condor.nexussoft.timeclock.onboarding.domain.port.in.UserImportUseCase;
import com.condor.nexussoft.timeclock.support.PostgisIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.sql.Time;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Importación masiva contra el esquema real: en una sola transacción crea usuario, roles, perfil
 * (HR) y turno (Scheduling) —cada contexto ve al usuario recién insertado gracias al volcado del
 * alta— y con un solo error no escribe nada.
 */
class UserImportIT extends PostgisIntegrationTest {

    @Autowired
    private UserImportUseCase imports;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private PasswordEncoder passwordEncoder;

    private final UserImportUseCase.Requester admin = new UserImportUseCase.Requester(
            new GranterAuthority(false, Set.of("COMPANY_ADMIN")), true);

    private UUID tenantId;
    private String suffix;

    @BeforeEach
    void seed() {
        tenantId = UUID.randomUUID();
        suffix = tenantId.toString().substring(0, 8);
        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, 'Empresa de prueba')", tenantId, "IT-" + suffix);
        jdbc.update("INSERT INTO company_settings (company_id) VALUES (?)", tenantId);
        jdbc.update("INSERT INTO company_capacity (company_id) VALUES (?)", tenantId);

        UUID scheduleId = UUID.randomUUID();
        jdbc.update("INSERT INTO schedules (id, tenant_id, code, name, timezone) VALUES (?, ?, 'HOR-01', 'Oficina', 'UTC')",
                scheduleId, tenantId);
        jdbc.update("INSERT INTO shifts (id, tenant_id, schedule_id, name, start_time, end_time, break_minutes) "
                        + "VALUES (?, ?, ?, 'Matutino', ?, ?, 0)",
                UUID.randomUUID(), tenantId, scheduleId, Time.valueOf(LocalTime.of(8, 0)), Time.valueOf(LocalTime.of(16, 0)));
        jdbc.update("INSERT INTO work_sites (id, tenant_id, code, name, location) "
                        + "VALUES (?, ?, 'CENTRO', 'Centro', ST_SetSRID(ST_MakePoint(-99.13, 19.43), 4326)::geography)",
                UUID.randomUUID(), tenantId);
    }

    @Test
    void importaUsuariosConRolesPerfilYTurno() {
        List<ImportRow> rows = List.of(
                row(2, "ana@" + suffix + ".example.com", "E-1", List.of("EMPLOYEE"), "F", "HOR-01", "Matutino", "CENTRO"),
                row(3, "luis@" + suffix + ".example.com", "E-2", List.of("SUPERVISOR", "EMPLOYEE"), null, null, null, null),
                row(4, "eva@" + suffix + ".example.com", null, List.of("AUDITOR"), null, null, null, null));

        ImportReport preview = imports.importUsers(tenantId, admin, rows, true);
        assertThat(preview.issues()).isEmpty();
        assertThat(preview.seatsNeeded()).isEqualTo(2);
        assertThat(count("SELECT count(*) FROM users WHERE tenant_id = ?")).isZero();

        ImportReport report = imports.importUsers(tenantId, admin, rows, false);

        assertThat(report.issues()).isEmpty();
        assertThat(report.created()).hasSize(3);
        assertThat(count("SELECT count(*) FROM users WHERE tenant_id = ?")).isEqualTo(3);
        assertThat(count("SELECT count(*) FROM employee_profiles WHERE tenant_id = ?")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM shift_assignments WHERE tenant_id = ?")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id WHERE u.tenant_id = ?"))
                .isEqualTo(4);

        ImportReport.ImportedUser ana = report.created().get(0);
        Map<String, Object> stored = jdbc.queryForMap(
                "SELECT u.password_hash, u.employee_code, p.gender, sa.work_site_id IS NOT NULL AS con_centro "
                        + "FROM users u JOIN employee_profiles p ON p.user_id = u.id "
                        + "JOIN shift_assignments sa ON sa.user_id = u.id WHERE u.id = ?", ana.userId());
        assertThat(passwordEncoder.matches(ana.temporaryPassword(), (String) stored.get("password_hash"))).isTrue();
        assertThat(stored.get("employee_code")).isEqualTo("E-1");
        assertThat(stored.get("gender")).isEqualTo("FEMALE");
        assertThat(stored.get("con_centro")).isEqualTo(true);
    }

    @Test
    void unaFilaInvalida_noEscribeNada() {
        List<ImportRow> rows = List.of(
                row(2, "ok@" + suffix + ".example.com", "E-1", List.of("EMPLOYEE"), null, null, null, null),
                row(3, "mal@" + suffix + ".example.com", "E-2", List.of("EMPLOYEE"), null, "HOR-01", "Nocturno", null));

        ImportReport report = imports.importUsers(tenantId, admin, rows, false);

        assertThat(report.issues()).extracting(i -> i.row() + ":" + i.code()).containsExactly("3:UNKNOWN_SHIFT");
        assertThat(count("SELECT count(*) FROM users WHERE tenant_id = ?")).isZero();
    }

    @Test
    void duplicadoContraElTenant_seDetectaEnLaVistaPrevia() {
        imports.importUsers(tenantId, admin,
                List.of(row(2, "ana@" + suffix + ".example.com", "E-1", List.of("EMPLOYEE"), null, null, null, null)), false);

        ImportReport report = imports.importUsers(tenantId, admin, List.of(
                row(2, "ANA@" + suffix + ".example.com", "E-9", List.of("EMPLOYEE"), null, null, null, null),
                row(3, "otra@" + suffix + ".example.com", "E-1", List.of("EMPLOYEE"), null, null, null, null)), true);

        assertThat(report.issues()).extracting(i -> i.row() + ":" + i.code())
                .containsExactlyInAnyOrder("2:DUPLICATE_EMAIL", "3:DUPLICATE_EMPLOYEE_CODE");
    }

    private ImportRow row(int n, String email, String code, List<String> roles, String gender,
                          String schedule, String shift, String site) {
        return new ImportRow(n, email, "Nombre", "Apellido", code, roles, null, null, null, gender, null, null, null,
                schedule, shift, site, schedule == null ? null : "2026-12-01", null);
    }

    private long count(String sql) {
        Long n = jdbc.queryForObject(sql, Long.class, tenantId);
        return n == null ? 0 : n;
    }
}
