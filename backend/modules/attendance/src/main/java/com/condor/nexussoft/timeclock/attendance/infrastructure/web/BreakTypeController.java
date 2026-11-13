package com.condor.nexussoft.timeclock.attendance.infrastructure.web;

import com.condor.nexussoft.timeclock.attendance.domain.port.in.BreakTypeCatalogUseCase;
import com.condor.nexussoft.timeclock.attendance.infrastructure.web.dto.BreakTypeDto;
import com.condor.nexussoft.timeclock.platform.tenant.TenantContext;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Categorías de descanso por empresa (almuerzo, comida, café…). Como el catálogo de tipos de
 * evento, la lectura es para cualquier autenticado —la app ofrece las habilitadas al iniciar un
 * descanso— y la edición exige {@code schedule:manage}.
 */
@RestController
@RequestMapping("/api/v1/attendance/break-types")
public class BreakTypeController {

    private final BreakTypeCatalogUseCase catalog;

    public BreakTypeController(BreakTypeCatalogUseCase catalog) {
        this.catalog = catalog;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<BreakTypeDto> list() {
        return catalog.list(TenantContext.require()).stream().map(BreakTypeDto::from).toList();
    }

    @PostMapping
    @PreAuthorize("hasAuthority('schedule:manage')")
    public BreakTypeDto create(@Valid @RequestBody BreakTypeDto body) {
        return BreakTypeDto.from(catalog.create(TenantContext.require(), body.toDraft()));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('schedule:manage')")
    public BreakTypeDto update(@PathVariable UUID id, @Valid @RequestBody BreakTypeDto body) {
        return BreakTypeDto.from(catalog.update(TenantContext.require(), id, body.toDraft()));
    }

    /** {@code deleted=false}: la categoría estaba en uso y solo se desactivó. */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('schedule:manage')")
    public Map<String, Boolean> delete(@PathVariable UUID id) {
        return Map.of("deleted", catalog.delete(TenantContext.require(), id));
    }
}
