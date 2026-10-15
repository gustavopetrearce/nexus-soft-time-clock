package com.condor.nexussoft.timeclock.identity.domain.port.out;

import java.util.UUID;

/**
 * Cupo de colaboradores activos del tenant, que pertenece al BC Tenancy (RF-29). Identity es
 * quien habilita colaboradores, así que es quien pregunta; el adaptador vive en el módulo de
 * arranque, que conoce ambos contextos (ADR-012).
 */
public interface TenantCapacityPort {

    /**
     * Reserva sitio para un colaborador más: comprueba el límite y bloquea la capacidad del
     * tenant hasta el fin de la transacción en curso, de modo que dos altas simultáneas no puedan
     * superar el cupo (RN-37).
     *
     * @throws com.condor.nexussoft.timeclock.shared.domain.ConflictException
     *         ({@code CAPACITY_EXCEEDED}) si el cupo está agotado.
     */
    void requireSlotForNewCollaborator(UUID tenantId);
}
