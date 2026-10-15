package com.condor.nexussoft.timeclock.identity.application;

import com.condor.nexussoft.timeclock.identity.domain.port.in.GranterAuthority;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserCommands;
import com.condor.nexussoft.timeclock.identity.domain.port.in.UserView;
import com.condor.nexussoft.timeclock.identity.domain.port.out.PasswordHasherPort;
import com.condor.nexussoft.timeclock.identity.domain.port.out.RefreshTokenStorePort;
import com.condor.nexussoft.timeclock.identity.domain.port.out.TenantCapacityPort;
import com.condor.nexussoft.timeclock.identity.domain.port.out.UserAdminRepositoryPort;
import com.condor.nexussoft.timeclock.shared.domain.AuthorizationException;
import com.condor.nexussoft.timeclock.shared.domain.ConflictException;
import com.condor.nexussoft.timeclock.shared.domain.ResourceNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserManagementServiceTest {

    @Mock UserAdminRepositoryPort users;
    @Mock PasswordHasherPort passwordHasher;
    @Mock RefreshTokenStorePort refreshTokens;
    @Mock TenantCapacityPort capacity;

    UserManagementService service;
    final UUID tenantId = UUID.randomUUID();

    final GranterAuthority companyAdmin = new GranterAuthority(false, Set.of("COMPANY_ADMIN"));
    final GranterAuthority platformAdmin = new GranterAuthority(true, Set.of("SUPER_ADMIN"));

    @BeforeEach
    void setUp() {
        service = new UserManagementService(users, passwordHasher, refreshTokens, capacity);
    }

    private UserCommands.CreateUserCommand command(Set<String> roleCodes) {
        return new UserCommands.CreateUserCommand("nuevo@demo.com", "Nuevo", "Usuario",
                "EMP-1", "secret123", roleCodes);
    }

    private UserView anyUserView() {
        return new UserView(UUID.randomUUID(), "nuevo@demo.com", "Nuevo", "Usuario",
                "EMP-1", "ACTIVE", List.of());
    }

    private UserView userView(String status, String... roleCodes) {
        return new UserView(UUID.randomUUID(), "alguien@demo.com", "Al", "Guien",
                "EMP-9", status, List.of(roleCodes));
    }

    // --- create --------------------------------------------------------

    @Test
    void create_companyAdminOtorgandoSuperAdmin_rechaza() {
        assertThatThrownBy(() -> service.create(tenantId, companyAdmin, command(Set.of("SUPER_ADMIN"))))
                .isInstanceOf(AuthorizationException.class)
                .extracting(e -> ((AuthorizationException) e).getCode())
                .isEqualTo("FORBIDDEN_ROLE_GRANT");
        verify(users, never()).create(any(), any(), any(), any(), any(), any(), anySet());
    }

    @Test
    void create_companyAdminOtorgandoCompanyAdmin_rechaza() {
        assertThatThrownBy(() -> service.create(tenantId, companyAdmin, command(Set.of("COMPANY_ADMIN"))))
                .isInstanceOf(AuthorizationException.class);
        verifyNoInteractions(passwordHasher);
        verify(users, never()).create(any(), any(), any(), any(), any(), any(), anySet());
    }

    @Test
    void create_companyAdminOtorgandoRolesInferiores_ok() {
        when(users.existsByTenantAndEmail(tenantId, "nuevo@demo.com")).thenReturn(false);
        when(passwordHasher.hash("secret123")).thenReturn("hashed");
        when(users.create(eq(tenantId), any(), any(), any(), any(), any(), eq(Set.of("EMPLOYEE", "SUPERVISOR"))))
                .thenReturn(anyUserView());

        UserView result = service.create(tenantId, companyAdmin, command(Set.of("EMPLOYEE", "SUPERVISOR")));

        assertThat(result).isNotNull();
        verify(users).create(eq(tenantId), any(), eq("hashed"), any(), any(), any(), anySet());
    }

    @Test
    void create_platformAdminOtorgandoSuperAdmin_ok() {
        when(users.existsByTenantAndEmail(tenantId, "nuevo@demo.com")).thenReturn(false);
        when(passwordHasher.hash("secret123")).thenReturn("hashed");
        when(users.create(any(), any(), any(), any(), any(), any(), anySet())).thenReturn(anyUserView());

        UserView result = service.create(tenantId, platformAdmin, command(Set.of("SUPER_ADMIN")));

        assertThat(result).isNotNull();
    }

    @Test
    void create_companyAdminOtorgandoRolDesconocido_rechaza() {
        assertThatThrownBy(() -> service.create(tenantId, companyAdmin, command(Set.of("ROOT"))))
                .isInstanceOf(AuthorizationException.class);
        verify(users, never()).create(any(), any(), any(), any(), any(), any(), anySet());
    }

    // --- create: cupo de colaboradores activos (RF-29) ------------------

    @Test
    void create_colaboradorQueRegistra_pasaPorElCupo() {
        when(users.existsByTenantAndEmail(tenantId, "nuevo@demo.com")).thenReturn(false);
        when(users.rolesEnableAttendanceRegister(Set.of("EMPLOYEE"))).thenReturn(true);
        when(passwordHasher.hash("secret123")).thenReturn("hashed");
        when(users.create(any(), any(), any(), any(), any(), any(), anySet())).thenReturn(anyUserView());

        service.create(tenantId, companyAdmin, command(Set.of("EMPLOYEE")));

        verify(capacity).requireSlotForNewCollaborator(tenantId);
    }

    @Test
    void create_cupoAgotado_noCreaElUsuario() {
        when(users.existsByTenantAndEmail(tenantId, "nuevo@demo.com")).thenReturn(false);
        when(users.rolesEnableAttendanceRegister(Set.of("EMPLOYEE"))).thenReturn(true);
        doThrow(new ConflictException("CAPACITY_EXCEEDED", "cupo agotado"))
                .when(capacity).requireSlotForNewCollaborator(tenantId);

        assertThatThrownBy(() -> service.create(tenantId, companyAdmin, command(Set.of("EMPLOYEE"))))
                .isInstanceOf(ConflictException.class)
                .extracting(e -> ((ConflictException) e).getCode())
                .isEqualTo("CAPACITY_EXCEEDED");
        // Ni hash de contraseña ni insert: el rechazo ocurre antes de tocar nada.
        verifyNoInteractions(passwordHasher);
        verify(users, never()).create(any(), any(), any(), any(), any(), any(), anySet());
    }

    @Test
    void create_cuentaDePortalSinRegistroDeAsistencia_noConsumeCupo() {
        when(users.existsByTenantAndEmail(tenantId, "nuevo@demo.com")).thenReturn(false);
        when(users.rolesEnableAttendanceRegister(Set.of("HR_ADMIN"))).thenReturn(false);
        when(passwordHasher.hash("secret123")).thenReturn("hashed");
        when(users.create(any(), any(), any(), any(), any(), any(), anySet())).thenReturn(anyUserView());

        service.create(tenantId, companyAdmin, command(Set.of("HR_ADMIN")));

        verifyNoInteractions(capacity);
    }

    // --- updateStatus ---------------------------------------------------

    @Test
    void updateStatus_reactivarColaborador_pasaPorElCupo() {
        UUID userId = UUID.randomUUID();
        when(users.findByIdAndTenant(userId, tenantId)).thenReturn(Optional.of(userView("INACTIVE", "EMPLOYEE")));
        when(users.rolesEnableAttendanceRegister(Set.of("EMPLOYEE"))).thenReturn(true);
        when(users.updateStatus(userId, tenantId, "ACTIVE")).thenReturn(Optional.of(userView("ACTIVE", "EMPLOYEE")));

        service.updateStatus(tenantId, userId, "ACTIVE");

        verify(capacity).requireSlotForNewCollaborator(tenantId);
        verify(refreshTokens, never()).revokeAllForUser(any());
    }

    @Test
    void updateStatus_reactivarConCupoAgotado_noCambiaElEstado() {
        UUID userId = UUID.randomUUID();
        when(users.findByIdAndTenant(userId, tenantId)).thenReturn(Optional.of(userView("INACTIVE", "EMPLOYEE")));
        when(users.rolesEnableAttendanceRegister(Set.of("EMPLOYEE"))).thenReturn(true);
        doThrow(new ConflictException("CAPACITY_EXCEEDED", "cupo agotado"))
                .when(capacity).requireSlotForNewCollaborator(tenantId);

        assertThatThrownBy(() -> service.updateStatus(tenantId, userId, "ACTIVE"))
                .isInstanceOf(ConflictException.class);
        verify(users, never()).updateStatus(any(), any(), any());
    }

    @Test
    void updateStatus_bajaDeColaborador_revocaSusSesiones() {
        UUID userId = UUID.randomUUID();
        when(users.findByIdAndTenant(userId, tenantId)).thenReturn(Optional.of(userView("ACTIVE", "EMPLOYEE")));
        when(users.updateStatus(userId, tenantId, "INACTIVE")).thenReturn(Optional.of(userView("INACTIVE", "EMPLOYEE")));

        service.updateStatus(tenantId, userId, "INACTIVE");

        // El cupo queda libre al instante: la sesión viva tiene que caer con la baja (RN-36).
        verify(refreshTokens).revokeAllForUser(userId);
        verifyNoInteractions(capacity);
    }

    @Test
    void updateStatus_desbloquearCuentaQueYaConsumiaCupo_noVuelveAPedirSitio() {
        UUID userId = UUID.randomUUID();
        when(users.findByIdAndTenant(userId, tenantId)).thenReturn(Optional.of(userView("LOCKED", "EMPLOYEE")));
        when(users.rolesEnableAttendanceRegister(Set.of("EMPLOYEE"))).thenReturn(true);
        when(users.updateStatus(userId, tenantId, "ACTIVE")).thenReturn(Optional.of(userView("ACTIVE", "EMPLOYEE")));

        service.updateStatus(tenantId, userId, "ACTIVE");

        // LOCKED es transitorio y nunca liberó cupo, así que desbloquear no consume otro asiento.
        verifyNoInteractions(capacity);
    }

    @Test
    void updateStatus_usuarioInexistente_lanzaNotFound() {
        UUID userId = UUID.randomUUID();
        when(users.findByIdAndTenant(userId, tenantId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.updateStatus(tenantId, userId, "ACTIVE"))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    // --- resetPassword -------------------------------------------------

    @Test
    void resetPassword_usuarioExistente_persisteNuevoHash() {
        UUID userId = UUID.randomUUID();
        when(passwordHasher.hash("nuevaClave1")).thenReturn("hashed");
        when(users.updatePassword(userId, tenantId, "hashed")).thenReturn(Optional.of(anyUserView()));

        UserView result = service.resetPassword(tenantId, userId, "nuevaClave1");

        assertThat(result).isNotNull();
        verify(users).updatePassword(userId, tenantId, "hashed");
        verify(refreshTokens).revokeAllForUser(userId);   // cierra sesiones activas
    }

    @Test
    void resetPassword_usuarioInexistente_lanzaYNoRevoca() {
        UUID userId = UUID.randomUUID();
        when(passwordHasher.hash("nuevaClave1")).thenReturn("hashed");
        when(users.updatePassword(userId, tenantId, "hashed")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.resetPassword(tenantId, userId, "nuevaClave1"))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(refreshTokens, never()).revokeAllForUser(any());
    }

    // --- assignRoles ---------------------------------------------------

    @Test
    void assignRoles_companyAdminOtorgandoSuperAdmin_rechaza() {
        UUID userId = UUID.randomUUID();
        assertThatThrownBy(() -> service.assignRoles(tenantId, companyAdmin, userId, Set.of("SUPER_ADMIN")))
                .isInstanceOf(AuthorizationException.class)
                .extracting(e -> ((AuthorizationException) e).getCode())
                .isEqualTo("FORBIDDEN_ROLE_GRANT");
        verify(users, never()).assignRoles(any(), any(), anySet());
    }

    @Test
    void assignRoles_companyAdminOtorgandoRolInferior_ok() {
        UUID userId = UUID.randomUUID();
        when(users.findByIdAndTenant(userId, tenantId)).thenReturn(Optional.of(userView("ACTIVE", "SUPERVISOR")));
        when(users.assignRoles(userId, tenantId, Set.of("HR_ADMIN"))).thenReturn(Optional.of(anyUserView()));

        UserView result = service.assignRoles(tenantId, companyAdmin, userId, Set.of("HR_ADMIN"));

        assertThat(result).isNotNull();
        verify(users).assignRoles(userId, tenantId, Set.of("HR_ADMIN"));
        verifyNoInteractions(capacity);
    }

    @Test
    void assignRoles_convertirCuentaDePortalEnColaborador_pasaPorElCupo() {
        UUID userId = UUID.randomUUID();
        when(users.findByIdAndTenant(userId, tenantId)).thenReturn(Optional.of(userView("ACTIVE", "SUPERVISOR")));
        when(users.rolesEnableAttendanceRegister(Set.of("SUPERVISOR"))).thenReturn(false);
        when(users.rolesEnableAttendanceRegister(Set.of("EMPLOYEE"))).thenReturn(true);
        when(users.assignRoles(userId, tenantId, Set.of("EMPLOYEE"))).thenReturn(Optional.of(anyUserView()));

        service.assignRoles(tenantId, companyAdmin, userId, Set.of("EMPLOYEE"));

        verify(capacity).requireSlotForNewCollaborator(tenantId);
    }

    @Test
    void assignRoles_quitarleElRolQueRegistra_noConsumeCupo() {
        UUID userId = UUID.randomUUID();
        when(users.findByIdAndTenant(userId, tenantId)).thenReturn(Optional.of(userView("ACTIVE", "EMPLOYEE")));
        when(users.rolesEnableAttendanceRegister(Set.of("EMPLOYEE"))).thenReturn(true);
        when(users.rolesEnableAttendanceRegister(Set.of("SUPERVISOR"))).thenReturn(false);
        when(users.assignRoles(userId, tenantId, Set.of("SUPERVISOR"))).thenReturn(Optional.of(anyUserView()));

        service.assignRoles(tenantId, companyAdmin, userId, Set.of("SUPERVISOR"));

        verifyNoInteractions(capacity);
    }
}
