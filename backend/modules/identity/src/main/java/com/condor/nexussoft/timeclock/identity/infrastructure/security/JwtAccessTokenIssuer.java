package com.condor.nexussoft.timeclock.identity.infrastructure.security;

import com.condor.nexussoft.timeclock.identity.domain.model.User;
import com.condor.nexussoft.timeclock.identity.domain.port.out.AccessTokenIssuerPort;
import com.condor.nexussoft.timeclock.identity.domain.port.out.IssuedToken;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;

/**
 * Emite el access token JWT (RS256) con las claims de identidad, tenant y autorizaciones.
 * Vida corta (ADR-007); el tiempo se toma del {@link Clock} de servidor (ADR-003).
 */
@Component
public class JwtAccessTokenIssuer implements AccessTokenIssuerPort {

    private final JwtEncoder jwtEncoder;
    private final Clock clock;
    private final long accessTtlSeconds;

    public JwtAccessTokenIssuer(JwtEncoder jwtEncoder, Clock clock,
                                @Value("${security.jwt.access-ttl-seconds:900}") long accessTtlSeconds) {
        this.jwtEncoder = jwtEncoder;
        this.clock = clock;
        this.accessTtlSeconds = accessTtlSeconds;
    }

    @Override
    public IssuedToken issue(User user) {
        Instant now = clock.instant();
        Instant expiresAt = now.plusSeconds(accessTtlSeconds);

        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer("nexus-time-clock")
                .issuedAt(now)
                .expiresAt(expiresAt)
                .subject(user.getId().toString())
                // El correo viaja en el token para que la bitácora se lea sin resolver el id
                // contra la tabla de usuarios en cada fila (RN-60, columna actor_email).
                .claim("email", user.email().value())
                .claim("roles", new ArrayList<>(user.roleCodes()))
                .claim("permissions", new ArrayList<>(user.permissionCodes()))
                .claim("platform_admin", user.platformAdmin());

        if (user.tenantId() != null) {
            claims.claim("tenant_id", user.tenantId().toString());
        }

        JwsHeader header = JwsHeader.with(org.springframework.security.oauth2.jose.jws.SignatureAlgorithm.RS256).build();
        String token = jwtEncoder.encode(JwtEncoderParameters.from(header, claims.build())).getTokenValue();
        return new IssuedToken(token, accessTtlSeconds);
    }
}
