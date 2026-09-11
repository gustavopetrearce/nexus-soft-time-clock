package com.condor.nexussoft.timeclock.geofencing.infrastructure.security;

import com.condor.nexussoft.timeclock.geofencing.domain.QrPayload;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class HmacQrTokenSignerTest {

    private final HmacQrTokenSigner signer = new HmacQrTokenSigner("test-secret");

    @Test
    void sign_then_verify_devuelveElMismoPayload() {
        QrPayload payload = new QrPayload(UUID.randomUUID(), UUID.randomUUID(), "nonce-123",
                Instant.parse("2026-07-21T10:02:00Z"));

        String token = signer.sign(payload);
        Optional<QrPayload> verified = signer.verify(token);

        assertThat(verified).isPresent();
        assertThat(verified.get().tenantId()).isEqualTo(payload.tenantId());
        assertThat(verified.get().workSiteId()).isEqualTo(payload.workSiteId());
        assertThat(verified.get().nonce()).isEqualTo("nonce-123");
        assertThat(verified.get().expiresAt()).isEqualTo(payload.expiresAt());
    }

    @Test
    void verify_conTokenAlterado_devuelveVacio() {
        String token = signer.sign(new QrPayload(UUID.randomUUID(), UUID.randomUUID(), "n",
                Instant.parse("2026-07-21T10:02:00Z")));
        String tampered = token.substring(0, token.indexOf('.') + 1) + "AAAA";

        assertThat(signer.verify(tampered)).isEmpty();
    }

    @Test
    void verify_conFirmaDeOtraLlave_devuelveVacio() {
        QrPayload payload = new QrPayload(UUID.randomUUID(), UUID.randomUUID(), "n",
                Instant.parse("2026-07-21T10:02:00Z"));
        String token = new HmacQrTokenSigner("otra-llave").sign(payload);

        assertThat(signer.verify(token)).isEmpty();   // firmado con secreto distinto
    }

    @Test
    void verify_conBasura_devuelveVacio() {
        assertThat(signer.verify("no-es-un-token")).isEmpty();
    }

    /** QR de empresa: el centro viaja vacío y debe volver como nulo, no como token ilegible. */
    @Test
    void sign_then_verify_deUnQrDeEmpresa_devuelveCentroNulo() {
        QrPayload payload = new QrPayload(UUID.randomUUID(), null, "nonce-empresa",
                Instant.parse("2026-07-21T10:02:00Z"));

        Optional<QrPayload> verified = signer.verify(signer.sign(payload));

        assertThat(verified).isPresent();
        assertThat(verified.get().tenantId()).isEqualTo(payload.tenantId());
        assertThat(verified.get().workSiteId()).isNull();
        assertThat(verified.get().isCompanyWide()).isTrue();
        assertThat(verified.get().nonce()).isEqualTo("nonce-empresa");
        assertThat(verified.get().expiresAt()).isEqualTo(payload.expiresAt());
    }

    /** El campo vacío del centro no debe hacer que el cuerpo pierda campos al trocearlo. */
    @Test
    void qrDeEmpresa_conNonceVacio_noSeConfundeConUnCuerpoDeTresCampos() {
        QrPayload payload = new QrPayload(UUID.randomUUID(), null, "",
                Instant.parse("2026-07-21T10:02:00Z"));

        Optional<QrPayload> verified = signer.verify(signer.sign(payload));

        assertThat(verified).isPresent();
        assertThat(verified.get().workSiteId()).isNull();
        assertThat(verified.get().expiresAt()).isEqualTo(payload.expiresAt());
    }
}
