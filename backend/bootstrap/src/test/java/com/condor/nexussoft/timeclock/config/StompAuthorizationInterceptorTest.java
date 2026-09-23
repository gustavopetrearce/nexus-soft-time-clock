package com.condor.nexussoft.timeclock.config;

import com.condor.nexussoft.timeclock.identity.infrastructure.security.NexusJwtAuthenticationConverter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * El canal STOMP era la única puerta del sistema sin control de tenant: el broker entregaba
 * {@code /topic/tenant/{id}/attendance} a cualquier conectado, sin credencial alguna. Estas
 * pruebas fijan la regla (RN-30, RN-31) para que no vuelva a abrirse en silencio.
 */
class StompAuthorizationInterceptorTest {

    private static final String TENANT = "11111111-1111-1111-1111-111111111111";
    private static final String OTRO_TENANT = "22222222-2222-2222-2222-222222222222";
    private static final String TOPICO_PROPIO = "/topic/tenant/" + TENANT + "/attendance";

    private JwtDecoder jwtDecoder;
    private StompAuthorizationInterceptor interceptor;

    @BeforeEach
    void setUp() {
        jwtDecoder = mock(JwtDecoder.class);
        interceptor = new StompAuthorizationInterceptor(jwtDecoder, new NexusJwtAuthenticationConverter());
    }

    // ---------- CONNECT ----------

    @Test
    @DisplayName("un CONNECT sin cabecera Authorization no establece la sesión")
    void connectSinToken() {
        assertThatThrownBy(() -> preSend(connect(null)))
                .isInstanceOf(MessagingException.class)
                .hasMessageContaining("sin token");
    }

    @Test
    @DisplayName("un CONNECT con token caducado o manipulado se rechaza")
    void connectTokenInvalido() {
        when(jwtDecoder.decode(anyString())).thenThrow(new JwtException("firma inválida"));

        assertThatThrownBy(() -> preSend(connect("Bearer basura")))
                .isInstanceOf(MessagingException.class)
                .hasMessageContaining("inválido");
    }

    @Test
    @DisplayName("un CONNECT válido deja la identidad del token fijada en la sesión")
    void connectValido() {
        String userId = UUID.randomUUID().toString();
        when(jwtDecoder.decode("bueno")).thenReturn(jwt(userId, TENANT, List.of("dashboard:read")));

        Message<?> message = connect("Bearer bueno");
        preSend(message);

        Principal user = MessageHeaderAccessor
                .getAccessor(message, StompHeaderAccessor.class).getUser();
        assertThat(user).isInstanceOf(JwtAuthenticationToken.class);
        assertThat(user.getName()).isEqualTo(userId);
    }

    // ---------- SUBSCRIBE ----------

    @Test
    @DisplayName("la suscripción al tópico del propio tenant se acepta")
    void suscripcionPropia() {
        assertThatCode(() -> preSend(subscribe(TOPICO_PROPIO, usuario(TENANT, List.of("dashboard:read")))))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("la suscripción al tópico de otra empresa se rechaza: era la fuga")
    void suscripcionAOtroTenant() {
        String ajeno = "/topic/tenant/" + OTRO_TENANT + "/attendance";

        assertThatThrownBy(() -> preSend(subscribe(ajeno, usuario(TENANT, List.of("dashboard:read")))))
                .isInstanceOf(MessagingException.class)
                .hasMessageContaining("fuera del ámbito");
    }

    @Test
    @DisplayName("un tenant que es prefijo de otro no abre el tópico del vecino")
    void suscripcionAPrefijoAjeno() {
        // Sin la barra final del prefijo, el tenant "1111...111" alcanzaría el "1111...1119".
        String vecino = "/topic/tenant/" + TENANT + "9/attendance";

        assertThatThrownBy(() -> preSend(subscribe(vecino, usuario(TENANT, List.of("dashboard:read")))))
                .isInstanceOf(MessagingException.class)
                .hasMessageContaining("fuera del ámbito");
    }

    @Test
    @DisplayName("sin el permiso dashboard:read no hay tiempo real, igual que en REST")
    void suscripcionSinPermiso() {
        assertThatThrownBy(() -> preSend(subscribe(TOPICO_PROPIO, usuario(TENANT, List.of("attendance:register")))))
                .isInstanceOf(MessagingException.class)
                .hasMessageContaining("dashboard:read");
    }

    @Test
    @DisplayName("un token de plataforma (sin tenant) no mira los datos de ninguna empresa")
    void suscripcionDeTokenSinTenant() {
        assertThatThrownBy(() -> preSend(subscribe(TOPICO_PROPIO, usuario(null, List.of("dashboard:read")))))
                .isInstanceOf(MessagingException.class)
                .hasMessageContaining("ninguna empresa");
    }

    @Test
    @DisplayName("un SUBSCRIBE sin CONNECT autenticado previo se rechaza")
    void suscripcionSinSesion() {
        assertThatThrownBy(() -> preSend(subscribe(TOPICO_PROPIO, null)))
                .isInstanceOf(MessagingException.class)
                .hasMessageContaining("sin autenticar");
    }

    // ---------- SEND ----------

    @Test
    @DisplayName("el cliente no puede publicar: el canal es de solo lectura")
    void envioDelCliente() {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SEND);
        accessor.setDestination(TOPICO_PROPIO);
        accessor.setUser(usuario(TENANT, List.of("dashboard:read")));

        assertThatThrownBy(() -> preSend(message(accessor)))
                .isInstanceOf(MessagingException.class)
                .hasMessageContaining("no publica");
    }

    // ---------- utilidades ----------

    private void preSend(Message<?> message) {
        interceptor.preSend(message, mock(MessageChannel.class));
    }

    private Message<?> connect(String authorization) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        if (authorization != null) {
            accessor.setNativeHeader("Authorization", authorization);
        }
        return message(accessor);
    }

    private Message<?> subscribe(String destination, Principal user) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setDestination(destination);
        accessor.setUser(user);
        return message(accessor);
    }

    /** El accesor debe quedar mutable: el interceptor fija el usuario sobre la propia trama. */
    private Message<?> message(StompHeaderAccessor accessor) {
        accessor.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    private JwtAuthenticationToken usuario(String tenant, List<String> permisos) {
        return (JwtAuthenticationToken) new NexusJwtAuthenticationConverter()
                .convert(jwt(UUID.randomUUID().toString(), tenant, permisos));
    }

    private Jwt jwt(String subject, String tenant, List<String> permisos) {
        Jwt.Builder builder = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject(subject)
                .claim("permissions", permisos)
                .claim("roles", List.of("SUPERVISOR"));
        if (tenant != null) {
            builder.claim("tenant_id", tenant);
        }
        return builder.build();
    }
}
