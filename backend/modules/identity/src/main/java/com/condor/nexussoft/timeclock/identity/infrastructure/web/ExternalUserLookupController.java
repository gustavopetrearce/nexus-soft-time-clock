package com.condor.nexussoft.timeclock.identity.infrastructure.web;

import com.condor.nexussoft.timeclock.identity.domain.port.in.ApiClientUseCase;
import com.condor.nexussoft.timeclock.identity.domain.port.in.CollaboratorDirectoryUseCase;
import com.condor.nexussoft.timeclock.identity.infrastructure.web.dto.ExternalUserResponse;
import com.condor.nexussoft.timeclock.platform.tenant.TenantContext;
import com.condor.nexussoft.timeclock.shared.domain.AuthorizationException;
import com.condor.nexussoft.timeclock.shared.domain.ResourceNotFoundException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Consulta de un colaborador por código de empleado desde un sistema externo (ADR-013), para
 * comprobarlo antes de marcar. Coincidencia exacta y sin correo ni roles: el emisor solo necesita
 * saber si existe y si puede marcar.
 */
@RestController
@RequestMapping("/api/v1/integrations/users")
public class ExternalUserLookupController {

    private final CollaboratorDirectoryUseCase collaborators;
    private final ApiClientUseCase clients;

    public ExternalUserLookupController(CollaboratorDirectoryUseCase collaborators, ApiClientUseCase clients) {
        this.collaborators = collaborators;
        this.clients = clients;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('user:lookup:external')")
    public ExternalUserResponse findByEmployeeCode(@RequestParam String employeeCode, @AuthenticationPrincipal Jwt jwt) {
        UUID tenantId = TenantContext.require();
        // Como en la marcación: el JWT sigue vigente tras revocar, así que se pregunta en cada petición.
        if (!clients.isActive(tenantId, UUID.fromString(jwt.getSubject()))) {
            throw new AuthorizationException("API_CLIENT_REVOKED", "La credencial ya no está activa.");
        }
        return collaborators.findByEmployeeCode(tenantId, employeeCode)
                .map(c -> ExternalUserResponse.from(employeeCode, c))
                .orElseThrow(() -> new ResourceNotFoundException("Colaborador", employeeCode));
    }
}
