package com.condor.nexussoft.timeclock.config;

import com.condor.nexussoft.timeclock.identity.infrastructure.security.NexusJwtAuthenticationConverter;
import com.condor.nexussoft.timeclock.realtime.infrastructure.WebSocketConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.support.AbstractSubscribableChannel;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * El interceptor solo protege si llega a instalarse. La autorización del canal vive en un
 * {@code WebSocketMessageBrokerConfigurer} distinto del que declara endpoint y broker
 * (realtime), así que esta prueba levanta ambos juntos y comprueba que Spring los agrega y
 * que el canal entrante acaba con el interceptor puesto: quitar el configurador rompe el build
 * en vez de reabrir el tópico en silencio.
 */
@SpringJUnitWebConfig(classes = {
        WebSocketConfig.class,
        WebSocketSecurityConfig.class,
        StompChannelWiringTest.SecurityBeans.class
})
class StompChannelWiringTest {

    @Test
    @DisplayName("el canal STOMP entrante lleva instalado el interceptor de autorización")
    void canalEntranteConInterceptor(
            @Autowired @Qualifier("clientInboundChannel") AbstractSubscribableChannel clientInbound) {
        assertThat(clientInbound.getInterceptors())
                .anyMatch(StompAuthorizationInterceptor.class::isInstance);
    }

    @Configuration
    static class SecurityBeans {
        @Bean
        JwtDecoder jwtDecoder() {
            return mock(JwtDecoder.class);
        }

        @Bean
        NexusJwtAuthenticationConverter jwtAuthConverter() {
            return new NexusJwtAuthenticationConverter();
        }
    }
}
