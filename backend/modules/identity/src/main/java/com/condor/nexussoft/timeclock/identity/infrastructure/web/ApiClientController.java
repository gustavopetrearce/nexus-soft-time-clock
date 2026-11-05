package com.condor.nexussoft.timeclock.identity.infrastructure.web;

import com.condor.nexussoft.timeclock.identity.domain.port.in.ApiClientUseCase;
import com.condor.nexussoft.timeclock.identity.infrastructure.web.dto.ApiClientCredentialsResponse;
import com.condor.nexussoft.timeclock.identity.infrastructure.web.dto.ApiClientResponse;
import com.condor.nexussoft.timeclock.identity.infrastructure.web.dto.CreateApiClientRequest;
import com.condor.nexussoft.timeclock.platform.tenant.TenantContext;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Administración de credenciales de sistemas externos de la propia empresa (ADR-013). */
@RestController
@RequestMapping("/api/v1/integrations/clients")
@PreAuthorize("hasAuthority('integration:manage')")
public class ApiClientController {

    private final ApiClientUseCase clients;

    public ApiClientController(ApiClientUseCase clients) {
        this.clients = clients;
    }

    @GetMapping
    public List<ApiClientResponse> list() {
        return clients.list(TenantContext.require()).stream().map(ApiClientResponse::from).toList();
    }

    @PostMapping
    public ResponseEntity<ApiClientCredentialsResponse> create(@Valid @RequestBody CreateApiClientRequest request,
                                                               @AuthenticationPrincipal Jwt jwt) {
        return withSecret(HttpStatus.CREATED, ApiClientCredentialsResponse.from(clients.create(
                TenantContext.require(), request.name(), UUID.fromString(jwt.getSubject()))));
    }

    @PostMapping("/{id}/rotate-secret")
    public ResponseEntity<ApiClientCredentialsResponse> rotateSecret(@PathVariable UUID id) {
        return withSecret(HttpStatus.OK,
                ApiClientCredentialsResponse.from(clients.rotateSecret(TenantContext.require(), id)));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke(@PathVariable UUID id) {
        clients.revoke(TenantContext.require(), id);
    }

    private ResponseEntity<ApiClientCredentialsResponse> withSecret(HttpStatus status, ApiClientCredentialsResponse body) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(body);
    }
}
