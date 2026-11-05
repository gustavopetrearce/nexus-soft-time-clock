package com.condor.nexussoft.timeclock.identity.infrastructure.security;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Traduce las claims del access token a autoridades de Spring Security:
 * cada permiso (recurso:acción) es una authority directa (para {@code hasAuthority(...)})
 * y cada rol se expone como {@code ROLE_<code>} (para {@code hasRole(...)}).
 */
@Component
public class NexusJwtAuthenticationConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    public static final String TOKEN_USE_CLAIM = "token_use";
    public static final String TOKEN_USE_CLIENT = "client";

    /** Marca los tokens de sistema externo: {@code SecurityConfig} los deja fuera de la API de usuarios. */
    public static final String CLIENT_AUTHORITY = "CLIENT";

    /** Fuera del catálogo de permisos a propósito: ningún rol de usuario puede recibirla (V28). */
    public static final String EXTERNAL_ATTENDANCE_AUTHORITY = "attendance:register:external";

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        List<GrantedAuthority> authorities = new ArrayList<>();

        List<String> permissions = jwt.getClaimAsStringList("permissions");
        if (permissions != null) {
            permissions.forEach(p -> authorities.add(new SimpleGrantedAuthority(p)));
        }
        List<String> roles = jwt.getClaimAsStringList("roles");
        if (roles != null) {
            roles.forEach(r -> authorities.add(new SimpleGrantedAuthority("ROLE_" + r)));
        }
        if (TOKEN_USE_CLIENT.equals(jwt.getClaimAsString(TOKEN_USE_CLAIM))) {
            authorities.add(new SimpleGrantedAuthority(CLIENT_AUTHORITY));
        }
        return new JwtAuthenticationToken(jwt, authorities, jwt.getSubject());
    }
}
