package com.condor.nexussoft.timeclock.identity.infrastructure.security;

import com.condor.nexussoft.timeclock.platform.audit.AuditActor;
import com.condor.nexussoft.timeclock.platform.audit.AuditContext;
import com.condor.nexussoft.timeclock.platform.web.HttpRequestMetadata;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Deja en {@link AuditContext} quién hace la petición y desde dónde, para que toda escritura
 * pueda registrar autor, IP, navegador y dispositivo (RN-60) sin que cada caso de uso tenga que
 * ir arrastrando esos datos por la firma de sus métodos.
 *
 * <p>Gemelo de {@link TenantContextFilter}: se apoya en el JWT ya autenticado y limpia el
 * contexto al terminar, porque el hilo vuelve al pool y el siguiente no puede heredar al
 * usuario del anterior.
 *
 * <p>En rutas públicas (login) no hay token todavía, pero la IP y el user-agent sí importan:
 * el actor queda sin usuario y con el origen puesto, que es justo lo que interesa auditar de
 * un intento de acceso.
 */
@Component
public class AuditContextFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain)
            throws ServletException, IOException {
        try {
            AuditContext.set(actorOf(request));
            filterChain.doFilter(request, response);
        } finally {
            AuditContext.clear();
        }
    }

    private AuditActor actorOf(HttpServletRequest request) {
        String ip = HttpRequestMetadata.clientIp(request);
        String userAgent = HttpRequestMetadata.userAgent(request);
        String device = HttpRequestMetadata.device(request);

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwtAuth) {
            Jwt jwt = jwtAuth.getToken();
            return AuditActor.ofUser(userId(jwt), jwt.getClaimAsString("email"), ip, userAgent, device);
        }
        return AuditActor.ofUser(null, null, ip, userAgent, device);
    }

    /** El subject es el id del usuario; si algún emisor futuro lo cambiara, no rompemos la petición. */
    private UUID userId(Jwt jwt) {
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException e) {
            return null;
        }
    }
}
