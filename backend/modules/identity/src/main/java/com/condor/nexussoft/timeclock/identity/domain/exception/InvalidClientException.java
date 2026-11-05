package com.condor.nexussoft.timeclock.identity.domain.exception;

import com.condor.nexussoft.timeclock.shared.domain.DomainException;

/** Credencial de sistema inválida. Mensaje único para no revelar si el client_id existe. */
public class InvalidClientException extends DomainException {
    public InvalidClientException() {
        super("INVALID_CLIENT", "Credenciales de cliente inválidas");
    }
}
