package com.condor.nexussoft.timeclock.identity.infrastructure.web.dto;

import com.condor.nexussoft.timeclock.identity.domain.port.in.ApiClientUseCase.ApiClientView;

import java.time.Instant;
import java.util.UUID;

public record ApiClientResponse(UUID id, String clientId, String name, String status,
                                Instant lastUsedAt, Instant revokedAt, Instant createdAt) {

    public static ApiClientResponse from(ApiClientView v) {
        return new ApiClientResponse(v.id(), v.clientId(), v.name(), v.status(),
                v.lastUsedAt(), v.revokedAt(), v.createdAt());
    }
}
