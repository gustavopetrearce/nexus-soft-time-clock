package com.condor.nexussoft.timeclock.identity.infrastructure.web;

import com.condor.nexussoft.timeclock.identity.domain.port.in.AuthenticationUseCase;
import com.condor.nexussoft.timeclock.identity.domain.port.in.LoginCommand;
import com.condor.nexussoft.timeclock.identity.infrastructure.web.dto.*;
import com.condor.nexussoft.timeclock.platform.web.HttpRequestMetadata;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Endpoints de autenticación (API v1). Login y refresh son públicos; {@code /me}
 * requiere un access token válido.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthenticationUseCase authentication;

    public AuthController(AuthenticationUseCase authentication) {
        this.authentication = authentication;
    }

    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        LoginCommand command = new LoginCommand(
                request.companyCode(), request.email(), request.password(),
                HttpRequestMetadata.clientIp(http), HttpRequestMetadata.userAgent(http));
        return TokenResponse.from(authentication.login(command));
    }

    @PostMapping("/refresh")
    public TokenResponse refresh(@Valid @RequestBody RefreshRequest request) {
        return TokenResponse.from(authentication.refresh(request.refreshToken()));
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@Valid @RequestBody RefreshRequest request) {
        authentication.logout(request.refreshToken());
    }

    @PostMapping("/change-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@Valid @RequestBody ChangePasswordRequest request,
                               @AuthenticationPrincipal Jwt jwt) {
        authentication.changePassword(
                UUID.fromString(jwt.getSubject()), request.currentPassword(), request.newPassword());
    }

    @GetMapping("/me")
    public MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        return new MeResponse(
                jwt.getSubject(),
                jwt.getClaimAsString("tenant_id"),
                Boolean.TRUE.equals(jwt.getClaimAsBoolean("platform_admin")),
                orEmpty(jwt.getClaimAsStringList("roles")),
                orEmpty(jwt.getClaimAsStringList("permissions")));
    }

    private static List<String> orEmpty(List<String> values) {
        return values == null ? List.of() : values;
    }

}
