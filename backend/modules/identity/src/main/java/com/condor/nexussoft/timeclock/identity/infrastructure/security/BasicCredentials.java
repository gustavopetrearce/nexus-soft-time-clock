package com.condor.nexussoft.timeclock.identity.infrastructure.security;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Optional;

/** Credencial de una cabecera {@code Authorization: Basic} (RFC 7617). */
public record BasicCredentials(String username, String password) {

    private static final String SCHEME = "Basic ";

    public static boolean isBasic(String authorization) {
        return authorization != null && authorization.regionMatches(true, 0, SCHEME, 0, SCHEME.length());
    }

    /** @return vacío si la cabecera no es Basic o está mal formada. */
    public static Optional<BasicCredentials> parse(String authorization) {
        if (!isBasic(authorization)) {
            return Optional.empty();
        }
        try {
            String decoded = new String(
                    Base64.getDecoder().decode(authorization.substring(SCHEME.length()).trim()),
                    StandardCharsets.UTF_8);
            int separator = decoded.indexOf(':');
            return separator < 0
                    ? Optional.empty()
                    : Optional.of(new BasicCredentials(decoded.substring(0, separator), decoded.substring(separator + 1)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
