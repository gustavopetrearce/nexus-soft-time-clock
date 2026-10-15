package com.condor.nexussoft.timeclock.identity;

import com.condor.nexussoft.timeclock.identity.domain.exception.InvalidCredentialsException;
import com.condor.nexussoft.timeclock.identity.domain.exception.InvalidRefreshTokenException;
import com.condor.nexussoft.timeclock.identity.domain.port.in.AuthTokens;
import com.condor.nexussoft.timeclock.identity.domain.port.in.AuthenticationUseCase;
import com.condor.nexussoft.timeclock.identity.domain.port.in.GranterAuthority;
import com.condor.nexussoft.timeclock.identity.domain.port.in.LoginCommand;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserCommands.CreateUserCommand;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserManagementUseCase;
import com.condor.nexussoft.timeclock.identity.domain.port.out.PasswordHasherPort;
import com.condor.nexussoft.timeclock.shared.domain.ConflictException;
import com.condor.nexussoft.timeclock.support.PostgisIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Escrituras que preceden a una excepción dentro de un {@code @Transactional}.
 *
 * <p>Con mocks (AuthenticationServiceTest) basta verificar que se llamó a {@code revokeFamily}; en
 * una base real, la excepción que viene detrás disparaba el rollback y la revocación —o el
 * contador de intentos fallidos— se perdía sin que ningún test lo notara. Aquí se comprueba lo que
 * queda en la base, que es lo único que importa.</p>
 */
class AuthTransactionRollbackIT extends PostgisIntegrationTest {

    private static final String PASSWORD = "secret-123";

    @Autowired
    private AuthenticationUseCase auth;
    @Autowired
    private UserManagementUseCase userManagement;
    @Autowired
    private PasswordHasherPort passwordHasher;
    @Autowired
    private JdbcTemplate jdbc;

    private UUID tenantId;
    private String companyCode;
    private UUID userId;
    private String email;

    @BeforeEach
    void seed() {
        tenantId = UUID.randomUUID();
        companyCode = "IT-" + tenantId.toString().substring(0, 8);
        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, 'Empresa de prueba')",
                tenantId, companyCode);
        jdbc.update("INSERT INTO company_settings (company_id) VALUES (?)", tenantId);
        jdbc.update("INSERT INTO company_capacity (company_id) VALUES (?)", tenantId);

        userId = UUID.randomUUID();
        email = "ada-" + userId.toString().substring(0, 8) + "@example.com";
        jdbc.update("INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name) "
                        + "VALUES (?, ?, ?, ?, 'Ada', 'Lovelace')",
                userId, tenantId, email, passwordHasher.hash(PASSWORD));
    }

    @Test
    void refreshReutilizado_revocaLaFamiliaEnLaBase() {
        AuthTokens first = login(PASSWORD);
        auth.refresh(first.refreshToken());   // rota: el primero queda reemplazado

        assertThatThrownBy(() -> auth.refresh(first.refreshToken()))
                .isInstanceOf(InvalidRefreshTokenException.class);

        // El token vigente tras la rotación tampoco debe sobrevivir a la reutilización.
        assertThat(liveTokens()).isZero();
    }

    @Test
    void refreshDeCuentaDadaDeBaja_revocaLaFamiliaEnLaBase() {
        AuthTokens tokens = login(PASSWORD);
        jdbc.update("UPDATE users SET status = 'INACTIVE' WHERE id = ?", userId);

        assertThatThrownBy(() -> auth.refresh(tokens.refreshToken()))
                .isInstanceOf(InvalidRefreshTokenException.class);

        assertThat(liveTokens()).isZero();
    }

    @Test
    void loginFallido_persisteElContadorDeIntentos() {
        assertThatThrownBy(() -> login("incorrecta"))
                .isInstanceOf(InvalidCredentialsException.class);

        Integer failed = jdbc.queryForObject(
                "SELECT failed_login_count FROM users WHERE id = ?", Integer.class, userId);
        assertThat(failed).isEqualTo(1);
    }

    @Test
    void cupoAgotado_rechazaElAltaYNoInsertaNada() {
        jdbc.update("UPDATE company_capacity SET base_limit = 1 WHERE company_id = ?", tenantId);
        GranterAuthority companyAdmin = new GranterAuthority(false, Set.of("COMPANY_ADMIN"));

        userManagement.create(tenantId, companyAdmin, employee("uno"));

        assertThatThrownBy(() -> userManagement.create(tenantId, companyAdmin, employee("dos")))
                .isInstanceOf(ConflictException.class)
                .extracting(e -> ((ConflictException) e).getCode())
                .isEqualTo("CAPACITY_EXCEEDED");
        Integer employees = jdbc.queryForObject(
                "SELECT count(*) FROM users WHERE tenant_id = ? AND email LIKE 'emp-%'",
                Integer.class, tenantId);
        assertThat(employees).isEqualTo(1);
    }

    private AuthTokens login(String password) {
        return auth.login(new LoginCommand(companyCode, email, password, "127.0.0.1", "it"));
    }

    private int liveTokens() {
        Integer live = jdbc.queryForObject(
                "SELECT count(*) FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL",
                Integer.class, userId);
        return live == null ? 0 : live;
    }

    private CreateUserCommand employee(String suffix) {
        return new CreateUserCommand("emp-" + suffix + "-" + tenantId.toString().substring(0, 8) + "@example.com",
                "Emp", suffix, "E-" + suffix, PASSWORD, Set.of("EMPLOYEE"));
    }
}
