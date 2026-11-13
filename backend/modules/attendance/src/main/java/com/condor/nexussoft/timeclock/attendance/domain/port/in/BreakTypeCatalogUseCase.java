package com.condor.nexussoft.timeclock.attendance.domain.port.in;

import com.condor.nexussoft.timeclock.attendance.domain.BreakType;

import java.util.List;
import java.util.UUID;

/** Administración de las categorías de descanso de una empresa. */
public interface BreakTypeCatalogUseCase {

    /** Datos editables de una categoría; el código se normaliza a mayúsculas. */
    record BreakTypeDraft(String code, String label, boolean enabled, boolean paid,
                          Integer maxMinutes, int sortOrder) {
    }

    List<BreakType> list(UUID tenantId);

    BreakType create(UUID tenantId, BreakTypeDraft draft);

    BreakType update(UUID tenantId, UUID id, BreakTypeDraft draft);

    /**
     * Borra la categoría; si ya hay marcas que la usan, la desactiva en su lugar para no dejar
     * el histórico sin etiqueta.
     *
     * @return {@code true} si se borró, {@code false} si solo se desactivó
     */
    boolean delete(UUID tenantId, UUID id);
}
