package com.condor.nexussoft.timeclock.identity.domain.port.out;

import com.condor.nexussoft.timeclock.identity.domain.model.ApiClient;
import com.condor.nexussoft.timeclock.identity.domain.model.User;

/** Emite el access token JWT con las claims del usuario (sub, tenant_id, roles, permisos). */
public interface AccessTokenIssuerPort {

    IssuedToken issue(User user);

    /** Token de un sistema externo: sin persona detrás y limitado a su endpoint (ADR-013). */
    IssuedToken issueForClient(ApiClient client);
}
