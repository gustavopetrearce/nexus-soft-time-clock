package com.condor.nexussoft.timeclock.identity.application;

import com.condor.nexussoft.timeclock.identity.domain.exception.InvalidCredentialsException;
import com.condor.nexussoft.timeclock.identity.domain.exception.InvalidRefreshTokenException;
import com.condor.nexussoft.timeclock.identity.domain.model.*;
import com.condor.nexussoft.timeclock.identity.domain.port.in.AuthTokens;
import com.condor.nexussoft.timeclock.identity.domain.port.in.LoginCommand;
import com.condor.nexussoft.timeclock.identity.domain.port.out.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthenticationServiceTest {

    @Mock UserRepositoryPort users;
    @Mock RefreshTokenStorePort refreshTokens;
    @Mock CompanyDirectoryPort companies;
    @Mock PasswordHasherPort passwordHasher;
    @Mock AccessTokenIssuerPort accessTokenIssuer;
    @Mock OpaqueTokenServicePort opaqueTokens;
    @Mock DomainEventPublisherPort eventPublisher;

    AuthenticationService service;
    final UUID tenantId = UUID.randomUUID();
    final Clock clock = Clock.fixed(Instant.parse("2026-07-21T10:00:00Z"), ZoneOffset.UTC);

    @BeforeEach
    void setUp() {
        service = new AuthenticationService(users, refreshTokens, companies, passwordHasher,
                accessTokenIssuer, opaqueTokens, eventPublisher, AuthPolicy.defaults(), clock);
    }

    private User activeUser() {
        return new User(UUID.randomUUID(), tenantId, false, Email.of("admin@demo.com"),
                "hash", "Ana", "Admin", UserStatus.ACTIVE, 0, null, Set.of());
    }

    @Test
    void login_conCredencialesValidas_emiteTokens() {
        User user = activeUser();
        when(companies.resolveActiveTenant("DEMO")).thenReturn(Optional.of(tenantId));
        when(users.findByTenantAndEmail(tenantId, Email.of("admin@demo.com"))).thenReturn(Optional.of(user));
        when(passwordHasher.matches("secret", "hash")).thenReturn(true);
        when(accessTokenIssuer.issue(user)).thenReturn(new IssuedToken("access-jwt", 900));
        when(opaqueTokens.generate()).thenReturn("raw-refresh");
        when(opaqueTokens.hash("raw-refresh")).thenReturn("hashed-refresh");

        AuthTokens tokens = service.login(new LoginCommand("DEMO", "admin@demo.com", "secret", "1.1.1.1", "junit"));

        assertThat(tokens.accessToken()).isEqualTo("access-jwt");
        assertThat(tokens.refreshToken()).isEqualTo("raw-refresh");
        assertThat(tokens.tokenType()).isEqualTo("Bearer");
        verify(refreshTokens).save(any());
    }

    @Test
    void login_conPasswordIncorrecta_lanzaYRegistraFallo() {
        User user = activeUser();
        when(companies.resolveActiveTenant("DEMO")).thenReturn(Optional.of(tenantId));
        when(users.findByTenantAndEmail(tenantId, Email.of("admin@demo.com"))).thenReturn(Optional.of(user));
        when(passwordHasher.matches("wrong", "hash")).thenReturn(false);

        assertThatThrownBy(() ->
                service.login(new LoginCommand("DEMO", "admin@demo.com", "wrong", "1.1.1.1", "junit")))
                .isInstanceOf(InvalidCredentialsException.class);

        verify(users).save(user);                 // persiste el contador de fallos
        assertThat(user.failedLoginCount()).isEqualTo(1);
    }

    @Test
    void changePassword_conActualCorrecta_persisteNuevoHash() {
        User user = activeUser();
        when(users.findById(user.getId())).thenReturn(Optional.of(user));
        when(passwordHasher.matches("actual", "hash")).thenReturn(true);
        when(passwordHasher.hash("nuevaClave1")).thenReturn("nuevo-hash");

        service.changePassword(user.getId(), "actual", "nuevaClave1");

        verify(users).updatePasswordHash(user.getId(), "nuevo-hash");
        verify(refreshTokens).revokeAllForUser(user.getId());   // cierra sesiones activas
    }

    @Test
    void changePassword_conActualIncorrecta_lanzaYNoActualiza() {
        User user = activeUser();
        when(users.findById(user.getId())).thenReturn(Optional.of(user));
        when(passwordHasher.matches("mala", "hash")).thenReturn(false);

        assertThatThrownBy(() -> service.changePassword(user.getId(), "mala", "nuevaClave1"))
                .isInstanceOf(InvalidCredentialsException.class);

        verify(users, never()).updatePasswordHash(any(), any());
        verify(passwordHasher, never()).hash(any());
        verify(refreshTokens, never()).revokeAllForUser(any());
    }

    @Test
    void changePassword_usuarioInexistente_lanza() {
        UUID id = UUID.randomUUID();
        when(users.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.changePassword(id, "actual", "nuevaClave1"))
                .isInstanceOf(InvalidCredentialsException.class);

        verify(users, never()).updatePasswordHash(any(), any());
    }

    @Test
    void refresh_conTokenReutilizado_revocaLaFamilia() {
        UUID familyId = UUID.randomUUID();
        RefreshToken reused = new RefreshToken(UUID.randomUUID(), familyId, UUID.randomUUID(), tenantId,
                "hashed", Instant.parse("2026-08-21T10:00:00Z"),
                Instant.parse("2026-07-20T10:00:00Z"), UUID.randomUUID());  // ya revocado/rotado
        when(opaqueTokens.hash("raw")).thenReturn("hashed");
        when(refreshTokens.findByHash("hashed")).thenReturn(Optional.of(reused));

        assertThatThrownBy(() -> service.refresh("raw"))
                .isInstanceOf(InvalidRefreshTokenException.class);

        verify(refreshTokens).revokeFamily(familyId);
    }

    @Test
    void refresh_deColaboradorDadoDeBaja_cortaLaSesionEnVezDeRotarla() {
        UUID familyId = UUID.randomUUID();
        User baja = new User(UUID.randomUUID(), tenantId, false, Email.of("baja@demo.com"),
                "hash", "Berta", "Baja", UserStatus.INACTIVE, 0, null, Set.of());
        RefreshToken vigente = new RefreshToken(UUID.randomUUID(), familyId, baja.getId(), tenantId,
                "hashed", Instant.parse("2026-08-21T10:00:00Z"), null, null);
        when(opaqueTokens.hash("raw")).thenReturn("hashed");
        when(refreshTokens.findByHash("hashed")).thenReturn(Optional.of(vigente));
        when(users.findById(baja.getId())).thenReturn(Optional.of(baja));

        assertThatThrownBy(() -> service.refresh("raw"))
                .isInstanceOf(InvalidRefreshTokenException.class);

        // Sin esto, la baja libera cupo pero el colaborador sigue renovando sesión 30 días (RN-36).
        verify(refreshTokens).revokeFamily(familyId);
        verify(refreshTokens, never()).save(any());
        verifyNoInteractions(accessTokenIssuer);
    }
}
