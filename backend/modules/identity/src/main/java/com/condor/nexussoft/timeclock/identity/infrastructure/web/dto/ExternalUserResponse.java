package com.condor.nexussoft.timeclock.identity.infrastructure.web.dto;

import com.condor.nexussoft.timeclock.identity.domain.port.in.CollaboratorDirectoryUseCase.Collaborator;
import com.condor.nexussoft.timeclock.identity.domain.port.in.CollaboratorDirectoryUseCase.Eligibility;

import java.util.UUID;

/** Colaborador visto por un sistema externo: lo justo para decidir si marcar (ADR-013). */
public record ExternalUserResponse(UUID id, String employeeCode, String firstName, String lastName,
                                   String status, boolean canRegisterAttendance) {

    public static ExternalUserResponse from(String employeeCode, Collaborator c) {
        return new ExternalUserResponse(c.userId(), employeeCode, c.firstName(), c.lastName(),
                c.status(), c.eligibility() == Eligibility.ELIGIBLE);
    }
}
