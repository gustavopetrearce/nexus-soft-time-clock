package com.condor.nexussoft.timeclock.geofencing.infrastructure.security;

import com.condor.nexussoft.timeclock.geofencing.domain.QrPayload;
import com.condor.nexussoft.timeclock.geofencing.domain.port.out.QrTokenSignerPort;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

/**
 * Firma el QR con HMAC-SHA256 (ADR-006). Formato: {@code base64url(body).base64url(sig)}
 * donde {@code body = tenantId|workSiteId|nonce|expEpochSeconds}. La verificación usa comparación
 * en tiempo constante para resistir ataques de temporización.
 *
 * <p>En un <b>QR de empresa</b> el segundo campo va vacío ({@code tenantId||nonce|exp}). El formato
 * no cambia —siguen siendo cuatro campos—, así que los QR de centro ya impresos se verifican
 * exactamente igual que antes.</p>
 */
@Component
public class HmacQrTokenSigner implements QrTokenSignerPort {

    private static final Base64.Encoder ENC = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DEC = Base64.getUrlDecoder();

    private final byte[] secret;

    public HmacQrTokenSigner(@Value("${security.qr.secret:dev-qr-secret-change-me}") String secret) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public String sign(QrPayload payload) {
        String site = payload.workSiteId() == null ? "" : payload.workSiteId().toString();
        String body = payload.tenantId() + "|" + site + "|" + payload.nonce()
                + "|" + payload.expiresAt().getEpochSecond();
        String b64Body = ENC.encodeToString(body.getBytes(StandardCharsets.UTF_8));
        String b64Sig = ENC.encodeToString(hmac(b64Body));
        return b64Body + "." + b64Sig;
    }

    @Override
    public Optional<QrPayload> verify(String token) {
        try {
            int dot = token.indexOf('.');
            if (dot <= 0) {
                return Optional.empty();
            }
            String b64Body = token.substring(0, dot);
            byte[] providedSig = DEC.decode(token.substring(dot + 1));
            byte[] expectedSig = hmac(b64Body);
            if (!MessageDigest.isEqual(providedSig, expectedSig)) {
                return Optional.empty();
            }
            String body = new String(DEC.decode(b64Body), StandardCharsets.UTF_8);
            // -1 conserva los campos vacíos intermedios; sin él, un cuerpo terminado en vacío
            // devolvería menos partes de las esperadas.
            String[] parts = body.split("\\|", -1);
            if (parts.length != 4) {
                return Optional.empty();
            }
            return Optional.of(new QrPayload(
                    UUID.fromString(parts[0]),
                    parts[1].isBlank() ? null : UUID.fromString(parts[1]),
                    parts[2],
                    Instant.ofEpochSecond(Long.parseLong(parts[3]))));
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    private byte[] hmac(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo calcular HMAC del QR", e);
        }
    }
}
