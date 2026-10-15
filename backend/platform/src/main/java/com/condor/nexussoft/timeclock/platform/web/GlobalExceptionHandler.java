package com.condor.nexussoft.timeclock.platform.web;

import com.condor.nexussoft.timeclock.shared.domain.AuthorizationException;
import com.condor.nexussoft.timeclock.shared.domain.ConflictException;
import com.condor.nexussoft.timeclock.shared.domain.DomainException;
import com.condor.nexussoft.timeclock.shared.domain.ResourceNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;
import java.time.Instant;
import java.util.stream.Collectors;

/**
 * Manejo uniforme de errores (RFC 7807 ProblemDetail). Garantiza respuestas de error
 * consistentes en toda la API (requisito de API REST: manejo uniforme de errores).
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ResourceNotFoundException.class)
    public ProblemDetail handleNotFound(ResourceNotFoundException ex, HttpServletRequest request) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
        pd.setTitle("Recurso no encontrado");
        pd.setProperty("code", ex.getCode());
        pd.setProperty("timestamp", Instant.now());
        pd.setProperty("path", request.getRequestURI());
        return pd;
    }

    @ExceptionHandler(AuthorizationException.class)
    public ProblemDetail handleAuthorization(AuthorizationException ex, HttpServletRequest request) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, ex.getMessage());
        pd.setTitle("Acción no autorizada");
        pd.setType(URI.create("urn:nexus:error:" + ex.getCode().toLowerCase()));
        pd.setProperty("code", ex.getCode());
        pd.setProperty("timestamp", Instant.now());
        pd.setProperty("path", request.getRequestURI());
        return pd;
    }

    /**
     * Conflicto con el estado actual (p.ej. cupo de colaboradores agotado, RN-34). Va antes que
     * {@link #handleDomain} por ser más específico: Spring elige el manejador más cercano en la
     * jerarquía, así que un {@code ConflictException} sale como 409 y no como 422.
     */
    @ExceptionHandler(ConflictException.class)
    public ProblemDetail handleConflict(ConflictException ex, HttpServletRequest request) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
        pd.setTitle("Conflicto con el estado actual");
        pd.setType(URI.create("urn:nexus:error:" + ex.getCode().toLowerCase()));
        pd.setProperty("code", ex.getCode());
        pd.setProperty("timestamp", Instant.now());
        pd.setProperty("path", request.getRequestURI());
        return pd;
    }

    @ExceptionHandler(DomainException.class)
    public ProblemDetail handleDomain(DomainException ex, HttpServletRequest request) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage());
        pd.setTitle("Regla de negocio no satisfecha");
        pd.setType(URI.create("urn:nexus:error:" + ex.getCode().toLowerCase()));
        pd.setProperty("code", ex.getCode());
        pd.setProperty("timestamp", Instant.now());
        pd.setProperty("path", request.getRequestURI());
        return pd;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex, HttpServletRequest request) {
        String detail = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .collect(Collectors.joining("; "));
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail);
        pd.setTitle("Solicitud inválida");
        pd.setProperty("code", "VALIDATION_ERROR");
        pd.setProperty("timestamp", Instant.now());
        pd.setProperty("path", request.getRequestURI());
        return pd;
    }

    /**
     * Permiso insuficiente en un {@code @PreAuthorize}. Sin este manejador cae en el catch-all y
     * se devuelve un 500 engañoso: el cliente no puede distinguir "no tienes permiso" de un fallo
     * del servidor, y el log se llena de errores que en realidad son denegaciones normales.
     */
    @ExceptionHandler(AuthorizationDeniedException.class)
    public ProblemDetail handleAccessDenied(AuthorizationDeniedException ex, HttpServletRequest request) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN,
                "No tienes permiso para realizar esta acción.");
        pd.setTitle("Acción no autorizada");
        pd.setProperty("code", "ACCESS_DENIED");
        pd.setProperty("timestamp", Instant.now());
        pd.setProperty("path", request.getRequestURI());
        return pd;
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnexpected(Exception ex, HttpServletRequest request) {
        // La respuesta no revela el detalle al cliente, así que sin esta traza el fallo se pierde
        // por completo y queda un 500 opaco imposible de diagnosticar.
        log.error("Error no controlado en {} {}", request.getMethod(), request.getRequestURI(), ex);
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR,
                "Error interno. Contacte al administrador si persiste.");
        pd.setTitle("Error interno");
        pd.setProperty("code", "INTERNAL_ERROR");
        pd.setProperty("timestamp", Instant.now());
        pd.setProperty("path", request.getRequestURI());
        return pd;
    }
}
