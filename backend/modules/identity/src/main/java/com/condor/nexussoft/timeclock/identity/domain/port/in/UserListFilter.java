package com.condor.nexussoft.timeclock.identity.domain.port.in;

/**
 * Filtros del listado de usuarios (RF-06, P20). Todos opcionales; vacío equivale a sin filtro.
 *
 * @param search       nombre, apellidos o correo (coincidencia parcial, sin distinguir mayúsculas)
 * @param employeeCode código de empleado (coincidencia parcial, sin distinguir mayúsculas)
 * @param status       estado exacto ({@code ACTIVE}, {@code INVITED}…)
 * @param role         código de rol que debe tener el usuario
 */
public record UserListFilter(String search, String employeeCode, String status, String role) {

    public static UserListFilter none() {
        return new UserListFilter(null, null, null, null);
    }
}
