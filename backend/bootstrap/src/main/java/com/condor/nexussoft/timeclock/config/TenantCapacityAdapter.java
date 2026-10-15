package com.condor.nexussoft.timeclock.config;

import com.condor.nexussoft.timeclock.identity.domain.port.out.TenantCapacityPort;
import com.condor.nexussoft.timeclock.tenancy.domain.port.in.CompanyCapacityUseCase;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Une el puerto de cupo de Identity con el caso de uso de Tenancy, que es el dueño del dato
 * (RF-29, ADR-012).
 *
 * <p>Vive en el módulo de arranque a propósito: es el único que depende de todos los bounded
 * contexts, así que aquí la dependencia no acopla Identity con Tenancy ni obliga a que Identity
 * lea las tablas de otro contexto. Identity sigue hablando solo con su puerto.
 */
@Component
public class TenantCapacityAdapter implements TenantCapacityPort {

    private final CompanyCapacityUseCase capacity;

    public TenantCapacityAdapter(CompanyCapacityUseCase capacity) {
        this.capacity = capacity;
    }

    @Override
    public void requireSlotForNewCollaborator(UUID tenantId) {
        capacity.requireSlotForNewCollaborator(tenantId);
    }
}
