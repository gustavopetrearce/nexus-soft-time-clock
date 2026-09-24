package com.condor.nexussoft.timeclock.config;

import com.condor.nexussoft.timeclock.identity.infrastructure.security.NexusJwtAuthenticationConverter;
import org.springframework.http.HttpHeaders;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.security.Principal;

/**
 * Autoriza el canal STOMP entrante: autentica el CONNECT con el mismo JWT que la API y acota
 * cada SUBSCRIBE al tenant de ese token (RN-30, RN-31, RNF-06).
 *
 * <p>El handshake HTTP de {@code /ws} es necesariamente anónimo —ni el WebSocket nativo ni los
 * transportes de respaldo de SockJS permiten enviar la cabecera {@code Authorization}—, así que
 * la identidad se presenta un escalón más adentro, en la trama CONNECT. Por eso
 * {@code SecurityConfig} deja {@code /ws/**} en {@code permitAll}: abrir el socket no autoriza
 * nada por sí solo.
 *
 * <p>Sin este interceptor el broker simple entregaba cualquier destino a cualquier conectado:
 * bastaba con saber (o adivinar) el id de otra empresa para leer sus marcaciones en vivo en
 * {@code /topic/tenant/{id}/attendance} sin presentar credencial alguna.
 */
public class StompAuthorizationInterceptor implements ChannelInterceptor {

    private static final String BEARER_PREFIX = "Bearer ";
    private static final String TENANT_TOPIC_PREFIX = "/topic/tenant/";

    /**
     * El mismo permiso que exige {@code GET /api/v1/dashboard/summary}: el tiempo real no puede
     * ser una puerta más ancha que la consulta equivalente por REST.
     */
    static final String REALTIME_AUTHORITY = "dashboard:read";

    private final JwtDecoder jwtDecoder;
    private final NexusJwtAuthenticationConverter jwtAuthConverter;

    public StompAuthorizationInterceptor(JwtDecoder jwtDecoder,
                                         NexusJwtAuthenticationConverter jwtAuthConverter) {
        this.jwtDecoder = jwtDecoder;
        this.jwtAuthConverter = jwtAuthConverter;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) {
            return message;  // latidos y tramas sin comando: nada que autorizar
        }
        switch (accessor.getCommand()) {
            case CONNECT -> accessor.setUser(authenticate(accessor));
            case SUBSCRIBE -> authorizeSubscription(accessor);
            // El canal es de solo lectura: no hay ningún @MessageMapping y el broker no debe
            // aceptar que un cliente inyecte eventos falsos en el tópico de su empresa.
            case SEND -> throw new MessagingException("El cliente no publica en este canal.");
            default -> { }
        }
        return message;
    }

    /** Identidad de la sesión: el CONNECT sin token válido no llega a establecerse. */
    private Authentication authenticate(StompHeaderAccessor accessor) {
        String header = accessor.getFirstNativeHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith(BEARER_PREFIX)) {
            throw new MessagingException("CONNECT sin token: el socket no se autentica solo.");
        }
        try {
            Jwt jwt = jwtDecoder.decode(header.substring(BEARER_PREFIX.length()).trim());
            return jwtAuthConverter.convert(jwt);
        } catch (JwtException e) {
            throw new MessagingException("Token inválido o caducado en el CONNECT.");
        }
    }

    /**
     * Un suscriptor solo alcanza los destinos de su propio tenant. El tenant sale del token
     * (RN-31), nunca del destino que pide el cliente, que es justamente el dato manipulable.
     */
    private void authorizeSubscription(StompHeaderAccessor accessor) {
        JwtAuthenticationToken auth = authenticatedUser(accessor.getUser());
        String tenant = auth.getToken().getClaimAsString("tenant_id");
        if (tenant == null || tenant.isBlank()) {
            // Un token de plataforma (SUPER_ADMIN) no tiene tenant y no opera datos de empresa
            // (V19): tampoco puede mirarlos pasar por el socket.
            throw new MessagingException("El token no pertenece a ninguna empresa.");
        }
        String destination = accessor.getDestination();
        // La barra final importa: sin ella el tenant "a1b2" abriría también "…/a1b2c3/…".
        if (destination == null || !destination.startsWith(TENANT_TOPIC_PREFIX + tenant + "/")) {
            throw new MessagingException("Suscripción fuera del ámbito del tenant: " + destination);
        }
        boolean allowed = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(REALTIME_AUTHORITY::equals);
        if (!allowed) {
            throw new MessagingException("Falta el permiso " + REALTIME_AUTHORITY + ".");
        }
    }

    private JwtAuthenticationToken authenticatedUser(Principal user) {
        if (user instanceof JwtAuthenticationToken jwtAuth) {
            return jwtAuth;
        }
        throw new MessagingException("Sesión sin autenticar: falta el CONNECT con token.");
    }
}
