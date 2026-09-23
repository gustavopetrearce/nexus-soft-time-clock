package com.condor.nexussoft.timeclock.config;

import com.condor.nexussoft.timeclock.identity.infrastructure.security.AuditContextFilter;
import com.condor.nexussoft.timeclock.identity.infrastructure.security.NexusJwtAuthenticationConverter;
import com.condor.nexussoft.timeclock.identity.infrastructure.security.TenantContextFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;

/**
 * Seguridad de la API (Iteración 5): stateless con JWT (resource server), RBAC por
 * método ({@code @PreAuthorize}) y filtro que fija el tenant desde el token (ADR-002/007).
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
                                           NexusJwtAuthenticationConverter jwtAuthConverter,
                                           TenantContextFilter tenantContextFilter,
                                           AuditContextFilter auditContextFilter) throws Exception {
        http
            .csrf(csrf -> csrf.disable())  // API stateless con Bearer token, no cookies de sesión
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                    "/api/v1/auth/login",
                    "/api/v1/auth/refresh",
                    "/api/v1/auth/logout",
                    "/api/v1/ping",
                    "/actuator/health/**",
                    "/actuator/info",
                    "/actuator/prometheus",
                    "/v3/api-docs/**",
                    "/swagger-ui/**",
                    "/swagger-ui.html",
                    // El handshake de /ws es anónimo a la fuerza (ni WebSocket ni SockJS pueden
                    // enviar Authorization). La identidad se exige en la trama CONNECT y el
                    // destino se acota al tenant en StompAuthorizationInterceptor.
                    "/ws/**"
                ).permitAll()
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthConverter)))
            .addFilterAfter(tenantContextFilter, BearerTokenAuthenticationFilter.class)
            // Después del tenant: ambos leen el token ya autenticado y el de auditoría debe
            // envolver a todo lo que escriba (RN-60).
            .addFilterAfter(auditContextFilter, TenantContextFilter.class);
        return http.build();
    }
}
