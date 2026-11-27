package com.condor.nexussoft.timeclock.attendance.infrastructure.web.dto;

import com.condor.nexussoft.timeclock.attendance.domain.port.in.BreakOptionsUseCase.BreakOption;

import java.util.UUID;

/**
 * Categoría de descanso con su disponibilidad para la jornada actual.
 *
 * @param availability AVAILABLE | NOT_ALLOWED_FOR_SHIFT | ALREADY_USED
 */
public record BreakOptionDto(UUID id, String code, String label, boolean paid, Integer maxMinutes, int sortOrder,
                             boolean available, String availability) {

    public static BreakOptionDto from(BreakOption o) {
        var b = o.breakType();
        return new BreakOptionDto(b.id(), b.code(), b.label(), b.paid(), b.maxMinutes(), b.sortOrder(),
                o.availability() == com.condor.nexussoft.timeclock.attendance.domain.BreakAllowancePolicy.Availability.AVAILABLE,
                o.availability().name());
    }
}
