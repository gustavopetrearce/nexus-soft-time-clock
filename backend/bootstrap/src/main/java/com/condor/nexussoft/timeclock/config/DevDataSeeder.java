package com.condor.nexussoft.timeclock.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Siembra datos de demostración SOLO en el perfil {@code dev}: una empresa DEMO, un super
 * admin de plataforma y usuarios admin/empleado, para poder probar el login extremo a extremo.
 * Es idempotente (no re-inserta si la empresa DEMO ya existe).
 *
 * Contraseñas por defecto (override con env): superadmin/admin/empleado = "Admin123!".
 */
@Component
@Profile("dev")
public class DevDataSeeder implements CommandLineRunner {

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;

    public DevDataSeeder(JdbcTemplate jdbc, PasswordEncoder passwordEncoder) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {
        Integer existing = jdbc.queryForObject(
                "SELECT count(*) FROM companies WHERE code = ?", Integer.class, "DEMO");
        if (existing != null && existing > 0) {
            return;
        }

        String defaultPassword = System.getenv().getOrDefault("NEXUS_SEED_PASSWORD", "Admin123!");
        String hash = passwordEncoder.encode(defaultPassword);

        UUID tenantId = UUID.randomUUID();
        jdbc.update("INSERT INTO companies (id, code, name, email_domain, timezone, locale, status) "
                        + "VALUES (?, 'DEMO', 'Empresa Demo', 'demo.com', 'America/Mexico_City', 'es', 'ACTIVE')",
                tenantId);
        jdbc.update("INSERT INTO company_settings (company_id) VALUES (?)", tenantId);
        jdbc.update("INSERT INTO company_capacity (company_id) VALUES (?)", tenantId);  // cupo base (RF-29)

        UUID superAdminId = UUID.randomUUID();
        jdbc.update("INSERT INTO users (id, tenant_id, is_platform_admin, email, password_hash, "
                        + "first_name, last_name, status) VALUES (?, NULL, true, ?, ?, ?, ?, 'ACTIVE')",
                superAdminId, "superadmin@nexus.io", hash, "Super", "Admin");
        assignRole(superAdminId, "SUPER_ADMIN");

        UUID adminId = UUID.randomUUID();
        jdbc.update("INSERT INTO users (id, tenant_id, is_platform_admin, email, password_hash, "
                        + "first_name, last_name, status) VALUES (?, ?, false, ?, ?, ?, ?, 'ACTIVE')",
                adminId, tenantId, "admin@demo.com", hash, "Ana", "Administradora");
        assignRole(adminId, "COMPANY_ADMIN");

        UUID employeeId = UUID.randomUUID();
        jdbc.update("INSERT INTO users (id, tenant_id, is_platform_admin, email, password_hash, "
                        + "first_name, last_name, status, employee_code) VALUES (?, ?, false, ?, ?, ?, ?, 'ACTIVE', 'EMP-001')",
                employeeId, tenantId, "empleado@demo.com", hash, "Emilio", "Empleado");
        assignRole(employeeId, "EMPLOYEE");
    }

    /** Asigna un rol plantilla del sistema (tenant_id IS NULL) al usuario. */
    private void assignRole(UUID userId, String roleCode) {
        UUID roleId = jdbc.queryForObject(
                "SELECT id FROM roles WHERE tenant_id IS NULL AND code = ?", UUID.class, roleCode);
        jdbc.update("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
                userId, roleId);
    }
}
