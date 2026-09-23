package com.condor.nexussoft.timeclock.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.autoconfigure.security.servlet.EndpointRequest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Protege el endpoint de métricas (RNF-11 sin regalar información).
 *
 * <p>{@code /actuator/prometheus} estaba en la lista pública de {@code SecurityConfig} y NGINX
 * publicaba todo {@code /actuator} al exterior: cualquiera podía leer el volumen de marcaciones,
 * los nombres de las colas, la topología y el uso de memoria del servidor sin credencial alguna.
 *
 * <p>No sirve el JWT de la aplicación: quien scrapea es Prometheus, que no inicia sesión. Se usa
 * una credencial propia por HTTP Basic —el patrón que entiende el {@code basic_auth} de su
 * configuración— en una cadena de filtros aparte, para no tocar la de la API.
 *
 * <p>Sin contraseña configurada el endpoint queda cerrado en vez de abierto: en producción un
 * despliegue al que se le olvidó la variable debe perder la métrica, no la privacidad.
 */
@Configuration
public class MetricsSecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(MetricsSecurityConfig.class);

    static final String METRICS_ROLE = "METRICS";

    private final String username;
    private final String password;

    public MetricsSecurityConfig(@Value("${security.metrics.username:prometheus}") String username,
                                 @Value("${security.metrics.password:}") String password) {
        this.username = username;
        this.password = password;
    }

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    public SecurityFilterChain metricsFilterChain(HttpSecurity http) throws Exception {
        http
            .securityMatcher(EndpointRequest.to("prometheus"))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> {
                if (credencialConfigurada()) {
                    auth.anyRequest().hasRole(METRICS_ROLE);
                } else {
                    auth.anyRequest().denyAll();
                }
            })
            .httpBasic(Customizer.withDefaults());
        return http.build();
    }

    @Bean
    public UserDetailsService metricsUserDetailsService() {
        if (!credencialConfigurada()) {
            log.warn("SECURITY_METRICS_PASSWORD sin definir: /actuator/prometheus queda cerrado "
                    + "y Prometheus no podrá scrapear este backend.");
            return new InMemoryUserDetailsManager();
        }
        // {noop}: la credencial la fija el operador en una variable de entorno y solo la usa el
        // scrape; guardarla cifrada aquí no añadiría nada, porque el valor en claro ya está en el
        // entorno del contenedor, igual que del lado de Prometheus.
        return new InMemoryUserDetailsManager(
                User.withUsername(username)
                        .password("{noop}" + password)
                        .roles(METRICS_ROLE)
                        .build());
    }

    private boolean credencialConfigurada() {
        return password != null && !password.isBlank();
    }
}
