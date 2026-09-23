package com.condor.nexussoft.timeclock.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * El scrape de métricas se protege con credencial propia, y la decisión que más importa es qué
 * pasa cuando falta: un despliegue al que se le olvidó la variable debe quedarse sin métrica,
 * nunca con el endpoint abierto como estaba.
 */
class MetricsSecurityConfigTest {

    @Test
    @DisplayName("con contraseña configurada existe el usuario del scrape con su rol")
    void credencialConfigurada() {
        UserDetailsService usuarios = new MetricsSecurityConfig("prometheus", "s3creto").metricsUserDetailsService();

        UserDetails usuario = usuarios.loadUserByUsername("prometheus");
        assertThat(usuario.getPassword()).isEqualTo("{noop}s3creto");
        assertThat(usuario.getAuthorities().stream().map(GrantedAuthority::getAuthority))
                .containsExactly("ROLE_" + MetricsSecurityConfig.METRICS_ROLE);
    }

    @Test
    @DisplayName("sin contraseña no hay usuario: el endpoint queda cerrado, no abierto")
    void sinCredencial() {
        UserDetailsService usuarios = new MetricsSecurityConfig("prometheus", "").metricsUserDetailsService();

        assertThatThrownBy(() -> usuarios.loadUserByUsername("prometheus"))
                .isInstanceOf(UsernameNotFoundException.class);
    }

    @Test
    @DisplayName("una contraseña en blanco cuenta como no configurada")
    void credencialEnBlanco() {
        UserDetailsService usuarios = new MetricsSecurityConfig("prometheus", "   ").metricsUserDetailsService();

        assertThatThrownBy(() -> usuarios.loadUserByUsername("prometheus"))
                .isInstanceOf(UsernameNotFoundException.class);
    }
}
