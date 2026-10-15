package com.condor.nexussoft.timeclock.tenancy.domain.port.in;

import com.condor.nexussoft.timeclock.tenancy.domain.CapacityStatus;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** Administración y comprobación del cupo de colaboradores activos (RF-29). */
public interface CompanyCapacityUseCase {

    /** Cupo y consumo actuales de la empresa. */
    CapacityStatus get(UUID companyId);

    /** Cupo y consumo de varias empresas, en el mismo orden en que se piden (una sola consulta). */
    List<CapacityStatus> getMany(Collection<UUID> companyIds);

    /**
     * Fija los bloques adicionales contratados (solo SUPER_ADMIN). Rechaza dejar el límite por
     * debajo del uso actual: primero hay que dar de baja colaboradores (D-09).
     */
    CapacityStatus setExtraBlocks(UUID companyId, int extraBlocks, UUID actorUserId);

    /**
     * Comprueba que queda cupo para habilitar <b>un</b> colaborador más y bloquea la fila de
     * capacidad hasta el fin de la transacción en curso (RN-37). La llama el BC Identity, que es
     * quien habilita colaboradores, a través de su propio puerto de salida.
     *
     * @throws com.condor.nexussoft.timeclock.shared.domain.ConflictException con código
     *         {@code CAPACITY_EXCEEDED} si el cupo está agotado.
     */
    void requireSlotForNewCollaborator(UUID tenantId);
}
