package com.condor.nexussoft.timeclock.hr.domain;

/** Contrato con su proyecto (si es PROJECT) y el aviso de revisión de RN-65. */
public record ContractView(EmploymentContract contract, ProjectRef project, boolean needsReview) {}
