package com.condor.nexussoft.timeclock.tenancy.infrastructure.web;

import com.condor.nexussoft.timeclock.platform.tenant.TenantContext;
import com.condor.nexussoft.timeclock.tenancy.domain.port.in.CompanyCapacityUseCase;
import com.condor.nexussoft.timeclock.tenancy.infrastructure.web.dto.CapacityDtos.CapacityResponse;
import com.condor.nexussoft.timeclock.tenancy.infrastructure.web.dto.CapacityDtos.UpdateCapacityRequest;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.List;
import java.util.UUID;

/**
 * Cupo de colaboradores activos de una empresa (RF-29).
 *
 * <p>La escritura es exclusiva del SUPER_ADMIN (`company:capacity`). La lectura se expone dos
 * veces a propósito: por empresa para la plataforma, y como `/me/capacity` para el COMPANY_ADMIN
 * —gated por `user:manage`, el permiso con el que da de alta colaboradores— que necesita entender
 * por qué un alta se rechaza sin poder tocar el cupo.
 */
@RestController
@RequestMapping("/api/v1/companies")
public class CompanyCapacityController {

    private final CompanyCapacityUseCase capacity;

    public CompanyCapacityController(CompanyCapacityUseCase capacity) {
        this.capacity = capacity;
    }

    @GetMapping("/{id}/capacity")
    @PreAuthorize("hasAuthority('company:capacity')")
    public CapacityResponse get(@PathVariable UUID id) {
        return CapacityResponse.from(capacity.get(id));
    }

    /**
     * Cupo de varias empresas de una vez. Existe para que el listado del portal pinte la columna
     * con una sola petición por página en vez de una por fila.
     */
    @GetMapping("/capacities")
    @PreAuthorize("hasAuthority('company:capacity')")
    public List<CapacityResponse> getMany(@RequestParam List<UUID> ids) {
        return capacity.getMany(ids).stream().map(CapacityResponse::from).toList();
    }

    @PutMapping("/{id}/capacity")
    @PreAuthorize("hasAuthority('company:capacity')")
    public CapacityResponse update(@PathVariable UUID id,
                                   @Valid @RequestBody UpdateCapacityRequest request,
                                   Principal principal) {
        // El nombre del principal es el subject del JWT, es decir el id del super admin que firma
        // el cambio (NexusJwtAuthenticationConverter). Queda en company_capacity.updated_by.
        UUID actor = principal == null ? null : UUID.fromString(principal.getName());
        return CapacityResponse.from(capacity.setExtraBlocks(id, request.extraBlocks(), actor));
    }

    /** Cupo de la propia empresa, en modo lectura, para quien administra sus colaboradores. */
    @GetMapping("/me/capacity")
    @PreAuthorize("hasAuthority('user:manage')")
    public CapacityResponse getMine() {
        return CapacityResponse.from(capacity.get(TenantContext.require()));
    }
}
