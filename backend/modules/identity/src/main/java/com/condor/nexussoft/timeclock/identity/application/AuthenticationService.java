package com.condor.nexussoft.timeclock.identity.application;

import com.condor.nexussoft.timeclock.identity.domain.exception.AccountLockedException;
import com.condor.nexussoft.timeclock.identity.domain.exception.InvalidCredentialsException;
import com.condor.nexussoft.timeclock.identity.domain.exception.InvalidRefreshTokenException;
import com.condor.nexussoft.timeclock.identity.domain.model.Email;
import com.condor.nexussoft.timeclock.identity.domain.model.RefreshToken;
import com.condor.nexussoft.timeclock.identity.domain.model.User;
import com.condor.nexussoft.timeclock.identity.domain.port.in.AuthTokens;
import com.condor.nexussoft.timeclock.identity.domain.port.in.AuthenticationUseCase;
import com.condor.nexussoft.timeclock.identity.domain.port.in.LoginCommand;
import com.condor.nexussoft.timeclock.identity.domain.port.out.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Orquesta la autenticación (login, refresh rotatorio, logout) combinando el dominio
 * con los puertos de salida. Es la implementación del puerto de entrada
 * {@link AuthenticationUseCase}. No conoce detalles de infraestructura (hexagonal).
 */
@Service
public class AuthenticationService implements AuthenticationUseCase {

    private final UserRepositoryPort users;
    private final RefreshTokenStorePort refreshTokens;
    private final CompanyDirectoryPort companies;
    private final PasswordHasherPort passwordHasher;
    private final AccessTokenIssuerPort accessTokenIssuer;
    private final OpaqueTokenServicePort opaqueTokens;
    private final DomainEventPublisherPort eventPublisher;
    private final AuthPolicy policy;
    private final Clock clock;

    public AuthenticationService(UserRepositoryPort users, RefreshTokenStorePort refreshTokens,
                                 CompanyDirectoryPort companies, PasswordHasherPort passwordHasher,
                                 AccessTokenIssuerPort accessTokenIssuer, OpaqueTokenServicePort opaqueTokens,
                                 DomainEventPublisherPort eventPublisher, AuthPolicy policy, Clock clock) {
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.companies = companies;
        this.passwordHasher = passwordHasher;
        this.accessTokenIssuer = accessTokenIssuer;
        this.opaqueTokens = opaqueTokens;
        this.eventPublisher = eventPublisher;
        this.policy = policy;
        this.clock = clock;
    }

    /**
     * {@code noRollbackFor}: un intento fallido incrementa el contador (y puede bloquear la cuenta,
     * RN-40) y <em>después</em> lanza la excepción. Con el rollback por defecto ante
     * {@code RuntimeException}, ese incremento se perdía y el bloqueo nunca llegaba.
     */
    @Override
    @Transactional(noRollbackFor = InvalidCredentialsException.class)
    public AuthTokens login(LoginCommand command) {
        Instant now = clock.instant();
        Email email = Email.of(command.email());
        User user = locateUser(command, email).orElseThrow(InvalidCredentialsException::new);

        if (user.isLocked(now)) {
            throw new AccountLockedException();
        }
        if (!user.canAuthenticate(now)) {
            throw new InvalidCredentialsException();  // inactiva/invitada: mensaje genérico
        }
        if (!passwordHasher.matches(command.password(), user.passwordHash())) {
            user.registerFailedLogin(policy.maxFailedLogins(), policy.lockDuration(), now);
            users.save(user);
            publish(user);
            throw new InvalidCredentialsException();
        }

        user.registerSuccessfulLogin(now);
        users.save(user);
        publish(user);
        return issueTokens(user, now);
    }

    /**
     * {@code noRollbackFor}: la reutilización de un token y la sesión de una cuenta dada de baja
     * revocan la familia y <em>después</em> lanzan la excepción. Sin esto el rollback deshacía la
     * revocación y la familia seguía viva.
     */
    @Override
    @Transactional(noRollbackFor = InvalidRefreshTokenException.class)
    public AuthTokens refresh(String rawRefreshToken) {
        Instant now = clock.instant();
        String hash = opaqueTokens.hash(rawRefreshToken);
        RefreshToken stored = refreshTokens.findByHash(hash)
                .orElseThrow(InvalidRefreshTokenException::new);

        // Detección de reutilización: si el token ya fue rotado/revocado, se compromete la familia.
        if (stored.isReused()) {
            refreshTokens.revokeFamily(stored.familyId());
            throw new InvalidRefreshTokenException();
        }
        if (!stored.isActive(now)) {
            throw new InvalidRefreshTokenException();  // expirado
        }

        User user = users.findById(stored.userId()).orElseThrow(InvalidRefreshTokenException::new);

        // El estado de la cuenta se revalida en cada rotación, no solo en el login: una baja o un
        // bloqueo deben cortar la sesión viva. Sin esto, un colaborador dado de baja seguiría
        // renovando su refresh hasta 30 días y registrando asistencia con el cupo ya liberado y
        // reasignado a otro (RN-36). Se revoca la familia completa para que el refresh en manos
        // del cliente no sirva tampoco en el siguiente intento.
        if (!user.canAuthenticate(now)) {
            refreshTokens.revokeFamily(stored.familyId());
            throw new InvalidRefreshTokenException();
        }

        // Rotación: se emite un nuevo refresh en la misma familia y se invalida el anterior.
        String rawNew = opaqueTokens.generate();
        UUID newId = UUID.randomUUID();
        RefreshToken rotated = new RefreshToken(
                newId, stored.familyId(), user.getId(), user.tenantId(),
                opaqueTokens.hash(rawNew), now.plus(policy.refreshTtl()), null, null);
        stored.markReplacedBy(newId, now);
        refreshTokens.update(stored);
        refreshTokens.save(rotated);

        IssuedToken access = accessTokenIssuer.issue(user);
        return AuthTokens.bearer(access.value(), rawNew, access.expiresInSeconds());
    }

    @Override
    @Transactional
    public void logout(String rawRefreshToken) {
        String hash = opaqueTokens.hash(rawRefreshToken);
        refreshTokens.findByHash(hash)
                .ifPresent(token -> refreshTokens.revokeFamily(token.familyId()));  // idempotente
    }

    @Override
    @Transactional
    public void changePassword(UUID userId, String currentPassword, String newPassword) {
        User user = users.findById(userId).orElseThrow(InvalidCredentialsException::new);
        if (!passwordHasher.matches(currentPassword, user.passwordHash())) {
            throw new InvalidCredentialsException();
        }
        users.updatePasswordHash(userId, passwordHasher.hash(newPassword));
        // Cierra todas las sesiones activas: los refresh tokens vigentes dejan de servir.
        refreshTokens.revokeAllForUser(userId);
    }

    // --- helpers -----------------------------------------------------

    private Optional<User> locateUser(LoginCommand command, Email email) {
        String companyRef = command.companyCode();
        if (companyRef != null && !companyRef.isBlank()) {
            return companies.resolveActiveTenant(companyRef)
                    .flatMap(tenantId -> users.findByTenantAndEmail(tenantId, email));
        }
        // Sin código de empresa: intenta plataforma, luego resuelve por dominio del email.
        Optional<User> platform = users.findPlatformAdminByEmail(email);
        if (platform.isPresent()) {
            return platform;
        }
        String domain = email.value().substring(email.value().indexOf('@') + 1);
        return companies.resolveActiveTenant(domain)
                .flatMap(tenantId -> users.findByTenantAndEmail(tenantId, email));
    }

    private AuthTokens issueTokens(User user, Instant now) {
        IssuedToken access = accessTokenIssuer.issue(user);
        String rawRefresh = opaqueTokens.generate();
        RefreshToken token = new RefreshToken(
                UUID.randomUUID(), UUID.randomUUID(), user.getId(), user.tenantId(),
                opaqueTokens.hash(rawRefresh), now.plus(policy.refreshTtl()), null, null);
        refreshTokens.save(token);
        return AuthTokens.bearer(access.value(), rawRefresh, access.expiresInSeconds());
    }

    private void publish(User user) {
        eventPublisher.publishAll(user.pullDomainEvents());
    }
}
