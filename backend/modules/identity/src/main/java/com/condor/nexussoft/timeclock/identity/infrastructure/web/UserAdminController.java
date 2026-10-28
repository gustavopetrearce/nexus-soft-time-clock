package com.condor.nexussoft.timeclock.identity.infrastructure.web;

import com.condor.nexussoft.timeclock.identity.domain.port.in.UserCommands;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserListFilter;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserManagementUseCase;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserView;
import com.condor.nexussoft.timeclock.identity.infrastructure.web.dto.*;
import com.condor.nexussoft.timeclock.platform.tenant.TenantContext;
import com.condor.nexussoft.timeclock.platform.web.PageResponse;
import com.condor.nexussoft.timeclock.shared.domain.Paged;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** Administración de usuarios del tenant (RF-06, RF-22). Requiere {@code user:manage}. */
@RestController
@RequestMapping("/api/v1/users")
@PreAuthorize("hasAuthority('user:manage')")
public class UserAdminController {

    private final UserManagementUseCase users;

    public UserAdminController(UserManagementUseCase users) {
        this.users = users;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse create(@Valid @RequestBody CreateUserRequest r, @AuthenticationPrincipal Jwt jwt) {
        UserView view = users.create(tenant(), GranterAuthorities.from(jwt), new UserCommands.CreateUserCommand(
                r.email(), r.firstName(), r.lastName(), r.employeeCode(), r.password(), r.roleCodes()));
        return UserResponse.from(view);
    }

    @GetMapping
    public PageResponse<UserResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String employeeCode,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String role) {
        Paged<UserView> result = users.list(tenant(), page, size, new UserListFilter(search, employeeCode, status, role));
        return PageResponse.of(result.items().stream().map(UserResponse::from).toList(),
                result.page(), result.size(), result.total());
    }

    @GetMapping("/{id}")
    public UserResponse get(@PathVariable UUID id) {
        return UserResponse.from(users.get(tenant(), id));
    }

    @PatchMapping("/{id}/status")
    public UserResponse updateStatus(@PathVariable UUID id, @Valid @RequestBody UpdateUserStatusRequest r) {
        return UserResponse.from(users.updateStatus(tenant(), id, r.status()));
    }

    @PatchMapping("/{id}/password")
    public UserResponse resetPassword(@PathVariable UUID id, @Valid @RequestBody ResetPasswordRequest r) {
        return UserResponse.from(users.resetPassword(tenant(), id, r.newPassword()));
    }

    @PutMapping("/{id}/roles")
    public UserResponse assignRoles(@PathVariable UUID id, @Valid @RequestBody AssignRolesRequest r,
                                    @AuthenticationPrincipal Jwt jwt) {
        return UserResponse.from(users.assignRoles(tenant(), GranterAuthorities.from(jwt), id, r.roleCodes()));
    }

    private UUID tenant() {
        return TenantContext.require();
    }
}
