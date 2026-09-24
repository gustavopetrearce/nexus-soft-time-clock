package com.condor.nexussoft.timeclock.config;

import com.condor.nexussoft.timeclock.identity.infrastructure.security.NexusJwtAuthenticationConverter;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * Engancha la autorización del canal STOMP (ADR-011). Vive junto a {@code SecurityConfig}
 * —y no en el módulo realtime— porque necesita las piezas de seguridad de BC-01 (el
 * {@code JwtDecoder} y el conversor de autoridades) y el bootstrap es quien compone los
 * bounded contexts sin acoplarlos entre sí.
 *
 * <p>Spring agrega todos los {@link WebSocketMessageBrokerConfigurer} del contexto, de modo que
 * esta clase convive con el {@code WebSocketConfig} de realtime, que define endpoint y broker.
 */
@Configuration
public class WebSocketSecurityConfig implements WebSocketMessageBrokerConfigurer {

    private final StompAuthorizationInterceptor interceptor;

    public WebSocketSecurityConfig(JwtDecoder jwtDecoder,
                                   NexusJwtAuthenticationConverter jwtAuthConverter) {
        this.interceptor = new StompAuthorizationInterceptor(jwtDecoder, jwtAuthConverter);
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(interceptor);
    }
}
