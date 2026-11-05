package com.condor.nexussoft.timeclock.identity.infrastructure.security;

import com.condor.nexussoft.timeclock.identity.domain.exception.InvalidClientException;
import com.condor.nexussoft.timeclock.identity.domain.port.in.ApiClientUseCase;
import com.condor.nexussoft.timeclock.identity.domain.port.in.ApiClientUseCase.AuthenticatedClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;

/**
 * Autentica con credencial fija a los dispositivos que no pueden renovar un token, como un reloj
 * checador (ADR-013). Solo actúa en la marcación y en la consulta de colaborador: una cabecera Basic
 * en cualquier otra ruta se ignora y acaba en 401.
 *
 * <p>Construye en memoria el mismo {@link Jwt} que llevaría un token de cliente. No se firma porque
 * no sale de la petición, y así {@code TenantContextFilter}, {@code AuditContextFilter} y las reglas
 * de autorización no necesitan saber por qué vía llegó la identidad.
 */
@Component
public class ApiClientBasicAuthenticationFilter extends OncePerRequestFilter {

    private static final String ATTENDANCE_PATH = "/api/v1/integrations/attendance";
    private static final String USER_LOOKUP_PATH = "/api/v1/integrations/users";

    private final ApiClientUseCase clients;
    private final NexusJwtAuthenticationConverter converter;
    private final ObjectMapper objectMapper;

    public ApiClientBasicAuthenticationFilter(ApiClientUseCase clients, NexusJwtAuthenticationConverter converter,
                                              ObjectMapper objectMapper) {
        this.clients = clients;
        this.converter = converter;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        return !isIntegrationEndpoint(request)
                || !BasicCredentials.isBasic(request.getHeader(HttpHeaders.AUTHORIZATION));
    }

    private boolean isIntegrationEndpoint(HttpServletRequest request) {
        String method = request.getMethod();
        String path = request.getRequestURI();
        return (HttpMethod.POST.matches(method) && ATTENDANCE_PATH.equals(path))
                || (HttpMethod.GET.matches(method) && USER_LOOKUP_PATH.equals(path));
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain)
            throws ServletException, IOException {
        AuthenticatedClient client;
        try {
            BasicCredentials credentials = BasicCredentials.parse(request.getHeader(HttpHeaders.AUTHORIZATION))
                    .orElseThrow(InvalidClientException::new);
            client = clients.authenticate(credentials.username(), credentials.password());
        } catch (InvalidClientException e) {
            reject(response, e);
            return;
        }
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(converter.convert(toJwt(client)));
        SecurityContextHolder.setContext(context);
        filterChain.doFilter(request, response);
    }

    private Jwt toJwt(AuthenticatedClient client) {
        return Jwt.withTokenValue("api-client-basic")
                .header("alg", "none")
                .claims(claims -> claims.putAll(
                        ClientClaims.of(client.id(), client.tenantId(), client.clientId(), client.name())))
                .build();
    }

    private void reject(HttpServletResponse response, InvalidClientException e) throws IOException {
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Basic");
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getWriter(), Map.of(
                "title", "Autenticación",
                "status", HttpStatus.UNAUTHORIZED.value(),
                "detail", e.getMessage(),
                "code", e.getCode()));
    }
}
