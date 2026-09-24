package com.condor.nexussoft.timeclock.realtime.infrastructure;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * Configuración STOMP para el tiempo real (ADR-011). Los clientes se conectan a {@code /ws}
 * y se suscriben a destinos por tenant ({@code /topic/tenant/{id}/attendance}).
 *
 * <p>Aquí solo se declaran endpoint y broker. Quién puede conectarse y a qué destino lo decide
 * {@code StompAuthorizationInterceptor} (bootstrap): autentica el CONNECT con el JWT de la API
 * y rechaza toda suscripción ajena al tenant del token (RN-30, RN-31).
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws").setAllowedOriginPatterns("*").withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
        registry.setApplicationDestinationPrefixes("/app");
    }
}
