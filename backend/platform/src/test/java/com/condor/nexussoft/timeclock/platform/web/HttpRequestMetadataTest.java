package com.condor.nexussoft.timeclock.platform.web;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La IP acaba en una columna {@code inet} y sale de una cabecera que escribe el cliente: lo que
 * no parezca una dirección no puede llegar al INSERT, porque el cast fallaría y se llevaría por
 * delante el commit de la operación que se estaba auditando.
 */
class HttpRequestMetadataTest {

    @Test
    @DisplayName("detrás del proxy manda el primer salto de X-Forwarded-For")
    void primerSaltoDelProxy() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("10.0.0.5");
        request.addHeader("X-Forwarded-For", "203.0.113.7, 10.0.0.5");

        assertThat(HttpRequestMetadata.clientIp(request)).isEqualTo("203.0.113.7");
    }

    @Test
    @DisplayName("sin cabecera de proxy vale la dirección de la conexión")
    void sinProxy() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("198.51.100.4");

        assertThat(HttpRequestMetadata.clientIp(request)).isEqualTo("198.51.100.4");
    }

    @Test
    @DisplayName("una cabecera con basura se descarta y se cae a la dirección real")
    void cabeceraManipulada() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("198.51.100.4");
        request.addHeader("X-Forwarded-For", "'; drop table audit_logs; --");

        assertThat(HttpRequestMetadata.clientIp(request)).isEqualTo("198.51.100.4");
    }

    @Test
    @DisplayName("una IPv6 se acepta tal cual")
    void ipv6() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Forwarded-For", "2001:db8::1");

        assertThat(HttpRequestMetadata.clientIp(request)).isEqualTo("2001:db8::1");
    }

    @Test
    @DisplayName("el user-agent se recorta al ancho de la columna")
    void userAgentRecortado() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("User-Agent", "x".repeat(600));

        assertThat(HttpRequestMetadata.userAgent(request)).hasSize(400);
    }

    @Test
    @DisplayName("sin cabeceras de cliente no se inventa nada")
    void sinDatos() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(null);

        assertThat(HttpRequestMetadata.clientIp(request)).isNull();
        assertThat(HttpRequestMetadata.userAgent(request)).isNull();
        assertThat(HttpRequestMetadata.device(request)).isNull();
    }
}
