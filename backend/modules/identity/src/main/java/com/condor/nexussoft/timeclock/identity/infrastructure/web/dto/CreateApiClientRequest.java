package com.condor.nexussoft.timeclock.identity.infrastructure.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateApiClientRequest(@NotBlank @Size(max = 120) String name) {
}
