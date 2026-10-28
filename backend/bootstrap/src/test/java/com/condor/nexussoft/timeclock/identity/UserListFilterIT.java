package com.condor.nexussoft.timeclock.identity;

import com.condor.nexussoft.timeclock.identity.domain.port.in.UserListFilter;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserManagementUseCase;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserView;
import com.condor.nexussoft.timeclock.support.PostgisIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Filtros de {@code GET /users} (P20) contra la base real: la búsqueda cubre nombre, apellidos,
 * nombre completo y correo; código, estado y rol se combinan y nunca salen del tenant.
 */
class UserListFilterIT extends PostgisIntegrationTest {

    @Autowired
    private UserManagementUseCase users;
    @Autowired
    private JdbcTemplate jdbc;

    private UUID tenantId;

    @BeforeEach
    void seed() {
        tenantId = company();
        user(tenantId, "ana.lopez", "Ana", "López Hernández", "EMP-0142", "ACTIVE", "EMPLOYEE");
        user(tenantId, "jorge.ramirez", "Jorge", "Ramírez Soto", "EMP-0218", "INVITED", "SUPERVISOR");
        user(tenantId, "karla.mendez", "Karla", "Méndez Ríos", "EMP-1310", "LOCKED", "EMPLOYEE");
        // Otra empresa con el mismo nombre: nunca debe aparecer.
        user(company(), "ana.otra", "Ana", "López Hernández", "EMP-0142", "ACTIVE", "EMPLOYEE");
    }

    @Test
    void buscaPorNombreApellidoYNombreCompletoSinDistinguirMayusculas() {
        assertThat(emails(new UserListFilter("ana", null, null, null))).containsExactly("ana.lopez");
        assertThat(emails(new UserListFilter("SOTO", null, null, null))).containsExactly("jorge.ramirez");
        assertThat(emails(new UserListFilter("karla méndez", null, null, null))).containsExactly("karla.mendez");
        assertThat(emails(new UserListFilter("jorge.ram", null, null, null))).containsExactly("jorge.ramirez");
    }

    @Test
    void filtraPorCodigoParcialEstadoYRol() {
        assertThat(emails(new UserListFilter(null, "emp-01", null, null))).containsExactly("ana.lopez");
        assertThat(emails(new UserListFilter(null, null, "invited", null))).containsExactly("jorge.ramirez");
        assertThat(emails(new UserListFilter(null, null, null, "EMPLOYEE"))).containsExactly("ana.lopez", "karla.mendez");
        assertThat(emails(new UserListFilter(null, "EMP-1", "LOCKED", "EMPLOYEE"))).containsExactly("karla.mendez");
    }

    @Test
    void sinFiltrosDevuelveSoloElTenant() {
        assertThat(emails(UserListFilter.none())).containsExactly("ana.lopez", "jorge.ramirez", "karla.mendez");
    }

    private List<String> emails(UserListFilter filter) {
        return users.list(tenantId, 0, 50, filter).items().stream()
                .map(UserView::email)
                .map(e -> e.substring(0, e.indexOf('@')))
                .toList();
    }

    private UUID company() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, 'Empresa de prueba')",
                id, "IT-" + id.toString().substring(0, 8));
        jdbc.update("INSERT INTO company_settings (company_id) VALUES (?)", id);
        jdbc.update("INSERT INTO company_capacity (company_id) VALUES (?)", id);
        return id;
    }

    private void user(UUID tenant, String local, String first, String last, String code, String status, String role) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, employee_code, status) "
                        + "VALUES (?, ?, ?, 'x', ?, ?, ?, ?)",
                id, tenant, local + "@" + tenant.toString().substring(0, 8) + ".example.com", first, last, code, status);
        jdbc.update("INSERT INTO user_roles (user_id, role_id) "
                + "SELECT ?, id FROM roles WHERE tenant_id IS NULL AND code = ?", id, role);
    }
}
