package com.condor.nexussoft.timeclock.identity.infrastructure.web.dto;

import com.condor.nexussoft.timeclock.identity.domain.port.in.ApiClientUseCase.ApiClientCredentials;

import java.util.UUID;

/** Única respuesta que lleva el secreto en claro: después ya no se puede recuperar. */
public record ApiClientCredentialsResponse(UUID id, String clientId, String clientSecret, String name) {

    public static ApiClientCredentialsResponse from(ApiClientCredentials c) {
        return new ApiClientCredentialsResponse(c.client().id(), c.client().clientId(),
                c.clientSecret(), c.client().name());
    }
}
