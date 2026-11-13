package com.condor.nexussoft.timeclock.attendance.infrastructure.web.dto;

import com.condor.nexussoft.timeclock.attendance.domain.BreakType;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.BreakTypeCatalogUseCase.BreakTypeDraft;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/** Categoría de descanso de la empresa. En la escritura se ignora {@code id}: lo fija la ruta. */
public record BreakTypeDto(
        UUID id,
        @NotBlank @Size(max = 30) String code,
        @NotBlank @Size(max = 60) String label,
        boolean enabled,
        boolean paid,
        @Positive Integer maxMinutes,
        int sortOrder) {

    public static BreakTypeDto from(BreakType b) {
        return new BreakTypeDto(b.id(), b.code(), b.label(), b.enabled(), b.paid(), b.maxMinutes(), b.sortOrder());
    }

    public BreakTypeDraft toDraft() {
        return new BreakTypeDraft(code, label, enabled, paid, maxMinutes, sortOrder);
    }
}
