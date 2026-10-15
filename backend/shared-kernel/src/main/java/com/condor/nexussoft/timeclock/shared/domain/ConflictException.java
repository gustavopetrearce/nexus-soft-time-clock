package com.condor.nexussoft.timeclock.shared.domain;

/**
 * Regla de negocio que choca con el <em>estado actual</em> del sistema, no con los datos de la
 * petición: el cupo de colaboradores ya está agotado, el bloque que se quiere quitar está en uso.
 *
 * <p>Se separa de {@link DomainException} (422) porque el cliente necesita distinguir "lo que me
 * mandaste no es válido" de "era válido, pero ahora mismo no se puede": lo primero se corrige
 * editando el formulario, lo segundo esperando o cambiando el estado del sistema. Se traduce a
 * HTTP 409.
 */
public class ConflictException extends DomainException {

    public ConflictException(String code, String message) {
        super(code, message);
    }
}
