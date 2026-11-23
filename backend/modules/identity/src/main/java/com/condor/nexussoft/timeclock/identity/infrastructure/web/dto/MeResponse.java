package com.condor.nexussoft.timeclock.identity.infrastructure.web.dto;

import java.util.List;

/**
 * Identidad del usuario autenticado, derivada de las claims del access token. {@code tenantName}
 * es el nombre de su empresa (nulo para el administrador de plataforma).
 */
public record MeResponse(String userId, String tenantId, String tenantName, boolean platformAdmin,
                         List<String> roles, List<String> permissions) {
}
