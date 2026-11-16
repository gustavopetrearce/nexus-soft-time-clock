package com.condor.nexussoft.timeclock.hr.infrastructure.web;

import java.util.Map;
import java.util.NoSuchElementException;
import org.springframework.core.Ordered;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Manejo de errores acotado a los controllers del módulo HR (basePackageClasses), para no
 * colisionar con el @RestControllerAdvice global. Mapea las excepciones de dominio a HTTP.
 *
 * <p>Precedencia máxima: sin ella el global, que atrapa {@code Exception}, se evaluaba primero y
 * estas excepciones salían como 500 en lugar de 404/409/400.</p>
 */
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(basePackageClasses = {EmployeeProfileController.class, VacationController.class,
        PermitController.class, ContractController.class})
public class HrExceptionHandler {

    /** Carrera contra una restricción de la BD (p. ej. el traslape de contratos, V33): conflicto, no 500. */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> integrity(DataIntegrityViolationException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "El cambio choca con otro registro; actualiza la vista e inténtalo de nuevo."));
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<Map<String, String>> notFound(NoSuchElementException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> conflict(IllegalStateException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler({IllegalArgumentException.class})
    public ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }
}
