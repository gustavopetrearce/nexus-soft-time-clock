package com.condor.nexussoft.timeclock.identity.infrastructure.security;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Identidad de un sistema externo (ADR-013), común al token firmado y a la autenticación con
 * credencial fija: así el resto de la petición no distingue por cuál de las dos llegó.
 *
 * <p>El {@code sub} es el id de la credencial, no de un usuario, y por eso {@code token_use} la delata
 * ante {@link NexusJwtAuthenticationConverter}, que la confina a sus endpoints. El correo lleva el
 * nombre de la integración para que la bitácora diga quién fue (RN-60).
 */
final class ClientClaims {

    private ClientClaims() {
    }

    static Map<String, Object> of(UUID id, UUID tenantId, String clientId, String name) {
        return Map.of(
                "sub", id.toString(),
                NexusJwtAuthenticationConverter.TOKEN_USE_CLAIM, NexusJwtAuthenticationConverter.TOKEN_USE_CLIENT,
                "client_id", clientId,
                "email", "integration:" + name,
                "tenant_id", tenantId.toString(),
                "permissions", List.of(NexusJwtAuthenticationConverter.EXTERNAL_ATTENDANCE_AUTHORITY,
                        NexusJwtAuthenticationConverter.EXTERNAL_USER_LOOKUP_AUTHORITY));
    }
}
