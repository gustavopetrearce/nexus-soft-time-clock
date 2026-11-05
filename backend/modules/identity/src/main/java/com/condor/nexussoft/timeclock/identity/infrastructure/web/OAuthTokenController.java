package com.condor.nexussoft.timeclock.identity.infrastructure.web;

import com.condor.nexussoft.timeclock.identity.domain.exception.InvalidClientException;
import com.condor.nexussoft.timeclock.identity.domain.port.in.ApiClientUseCase;
import com.condor.nexussoft.timeclock.identity.infrastructure.security.BasicCredentials;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Canje de credenciales de sistema por un access token, con el contrato de OAuth2
 * {@code client_credentials} (RFC 6749 §4.4 y §5.2) para que sirva cualquier librería cliente.
 * Por eso aquí las respuestas no siguen el ProblemDetail y los campos van en snake_case.
 */
@RestController
@RequestMapping("/api/v1/oauth")
public class OAuthTokenController {

    private static final String CLIENT_CREDENTIALS = "client_credentials";

    private final ApiClientUseCase clients;

    public OAuthTokenController(ApiClientUseCase clients) {
        this.clients = clients;
    }

    public record TokenBody(@JsonProperty("access_token") String accessToken,
                            @JsonProperty("token_type") String tokenType,
                            @JsonProperty("expires_in") long expiresIn) {
    }

    public record ErrorBody(String error, @JsonProperty("error_description") String errorDescription) {
    }

    @PostMapping(path = "/token", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<?> token(HttpServletRequest request,
                                   @RequestParam(name = "grant_type", required = false) String grantType,
                                   @RequestParam(name = "client_id", required = false) String clientId,
                                   @RequestParam(name = "client_secret", required = false) String clientSecret,
                                   @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        // En la URL el secreto acabaría en los logs de acceso de nginx (RFC 6749 §2.3.1).
        String query = request.getQueryString();
        if (query != null && query.contains("client_secret")) {
            return error(HttpStatus.BAD_REQUEST, "invalid_request", "El secreto no puede ir en la URL.");
        }
        if (grantType == null || grantType.isBlank()) {
            return error(HttpStatus.BAD_REQUEST, "invalid_request", "Falta grant_type.");
        }
        if (!CLIENT_CREDENTIALS.equals(grantType)) {
            return error(HttpStatus.BAD_REQUEST, "unsupported_grant_type", "Solo se admite client_credentials.");
        }
        BasicCredentials credentials = BasicCredentials.isBasic(authorization)
                ? BasicCredentials.parse(authorization).orElseThrow(InvalidClientException::new)
                : new BasicCredentials(clientId, clientSecret);
        if (credentials.username() == null || credentials.password() == null) {
            throw new InvalidClientException();
        }
        ApiClientUseCase.ClientAccessToken token =
                clients.issueToken(credentials.username(), credentials.password());
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new TokenBody(token.value(), "Bearer", token.expiresInSeconds()));
    }

    @ExceptionHandler(InvalidClientException.class)
    public ResponseEntity<ErrorBody> invalidClient(InvalidClientException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .header(HttpHeaders.WWW_AUTHENTICATE, "Basic")
                .cacheControl(CacheControl.noStore())
                .body(new ErrorBody("invalid_client", ex.getMessage()));
    }

    private ResponseEntity<ErrorBody> error(HttpStatus status, String code, String description) {
        return ResponseEntity.status(status)
                .cacheControl(CacheControl.noStore())
                .body(new ErrorBody(code, description));
    }
}
