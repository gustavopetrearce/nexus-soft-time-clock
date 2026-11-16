package com.condor.nexussoft.timeclock.hr.application;

import com.condor.nexussoft.timeclock.hr.domain.ContractStatus;
import com.condor.nexussoft.timeclock.hr.domain.ContractType;
import com.condor.nexussoft.timeclock.hr.domain.ContractView;
import com.condor.nexussoft.timeclock.hr.domain.EmploymentContract;
import com.condor.nexussoft.timeclock.hr.domain.ProjectRef;
import com.condor.nexussoft.timeclock.hr.domain.port.in.ContractUseCase.CancelCommand;
import com.condor.nexussoft.timeclock.hr.domain.port.in.ContractUseCase.CreateCommand;
import com.condor.nexussoft.timeclock.hr.domain.port.in.ContractUseCase.EndCommand;
import com.condor.nexussoft.timeclock.hr.domain.port.in.ContractUseCase.UpdateCommand;
import com.condor.nexussoft.timeclock.hr.domain.port.out.ContractRepositoryPort;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ContractServiceTest {

    private static final LocalDate JAN1 = LocalDate.of(2026, 1, 1);
    private static final LocalDate DEC31 = LocalDate.of(2026, 12, 31);

    @Mock
    private ContractRepositoryPort contracts;

    private ContractService service;

    private final UUID tenant = UUID.randomUUID();
    private final UUID employee = UUID.randomUUID();
    private final UUID admin = UUID.randomUUID();
    private final UUID projectId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new ContractService(contracts);
        when(contracts.isCollaborator(tenant, employee)).thenReturn(true);
        when(contracts.findProject(tenant, projectId)).thenReturn(Optional.of(project("ACTIVE", JAN1, DEC31)));
        when(contracts.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    private ProjectRef project(String status, LocalDate start, LocalDate end) {
        return new ProjectRef(projectId, "OBRA-1", "Obra Norte", status, start, end);
    }

    private CreateCommand projectContract(LocalDate start, LocalDate end) {
        return new CreateCommand(tenant, employee, admin, ContractType.PROJECT, projectId, null, start, end, "  ");
    }

    private CreateCommand shiftContract(LocalDate start, LocalDate end) {
        return new CreateCommand(tenant, employee, admin, ContractType.SHIFT, null, null, start, end, null);
    }

    private EmploymentContract stored(ContractType type, ContractStatus status, LocalDate start, LocalDate end) {
        return new EmploymentContract(UUID.randomUUID(), tenant, employee, type,
                type == ContractType.PROJECT ? projectId : null, null, start, end, status, null, admin,
                null, null, null, null, null, OffsetDateTime.now());
    }

    // ---- alta ----

    @Test
    void porProyecto_sinFin_heredaElFinDelProyecto() {
        ContractView v = service.create(projectContract(LocalDate.of(2026, 3, 1), null));

        assertThat(v.contract().endsOn()).isEqualTo(DEC31);
        assertThat(v.contract().status()).isEqualTo(ContractStatus.ACTIVE);
        assertThat(v.contract().notes()).isNull();
        assertThat(v.project().code()).isEqualTo("OBRA-1");
        assertThat(v.needsReview()).isFalse();
    }

    @Test
    void porProyecto_fueraDeLaVigenciaDelProyecto_falla() {
        assertThatThrownBy(() -> service.create(projectContract(LocalDate.of(2025, 12, 1), LocalDate.of(2026, 2, 1))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("vigencia del proyecto");
        assertThatThrownBy(() -> service.create(projectContract(JAN1, LocalDate.of(2027, 1, 15))))
                .isInstanceOf(IllegalArgumentException.class);
        verify(contracts, never()).save(any());
    }

    @Test
    void porProyecto_conProyectoNoActivo_falla() {
        when(contracts.findProject(tenant, projectId)).thenReturn(Optional.of(project("CLOSED", JAN1, DEC31)));

        assertThatThrownBy(() -> service.create(projectContract(JAN1, DEC31)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void porProyecto_sinProyecto_falla_yPorTurnoConProyecto_falla() {
        assertThatThrownBy(() -> service.create(new CreateCommand(tenant, employee, admin, ContractType.PROJECT,
                null, null, JAN1, DEC31, null))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.create(new CreateCommand(tenant, employee, admin, ContractType.SHIFT,
                projectId, null, JAN1, DEC31, null))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void porTurno_puedeSerIndefinido() {
        ContractView v = service.create(shiftContract(JAN1, null));

        assertThat(v.contract().type()).isEqualTo(ContractType.SHIFT);
        assertThat(v.contract().projectId()).isNull();
        assertThat(v.contract().endsOn()).isNull();
        assertThat(v.project()).isNull();
    }

    @Test
    void traslape_conOtroContrato_falla() {
        when(contracts.overlaps(tenant, employee, JAN1, null, null)).thenReturn(true);

        assertThatThrownBy(() -> service.create(shiftContract(JAN1, null)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("traslapa");
    }

    @Test
    void finAnteriorAlInicio_falla() {
        assertThatThrownBy(() -> service.create(shiftContract(DEC31, JAN1)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void colaboradorOCentroInexistente_falla() {
        assertThatThrownBy(() -> service.create(new CreateCommand(tenant, UUID.randomUUID(), admin,
                ContractType.SHIFT, null, null, JAN1, null, null))).isInstanceOf(NoSuchElementException.class);

        UUID site = UUID.randomUUID();
        when(contracts.workSiteExists(tenant, site)).thenReturn(false);
        assertThatThrownBy(() -> service.create(new CreateCommand(tenant, employee, admin,
                ContractType.SHIFT, null, site, JAN1, null, null))).isInstanceOf(NoSuchElementException.class);
    }

    // ---- edición, término y cancelación ----

    @Test
    void editar_excluyeElPropioContratoDelTraslape() {
        EmploymentContract c = stored(ContractType.SHIFT, ContractStatus.ACTIVE, JAN1, null);
        when(contracts.find(tenant, c.id())).thenReturn(Optional.of(c));

        ContractView v = service.update(new UpdateCommand(tenant, c.id(), null, JAN1, DEC31, "renovación"));

        verify(contracts).overlaps(tenant, employee, JAN1, DEC31, c.id());
        assertThat(v.contract().endsOn()).isEqualTo(DEC31);
        assertThat(v.contract().notes()).isEqualTo("renovación");
    }

    @Test
    void editar_contratoTerminado_falla() {
        EmploymentContract c = stored(ContractType.SHIFT, ContractStatus.ENDED, JAN1, DEC31);
        when(contracts.find(tenant, c.id())).thenReturn(Optional.of(c));

        assertThatThrownBy(() -> service.update(new UpdateCommand(tenant, c.id(), null, JAN1, null, null)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void terminar_recortaLaVigencia_peroNoLaAmplia() {
        EmploymentContract c = stored(ContractType.SHIFT, ContractStatus.ACTIVE, JAN1, LocalDate.of(2026, 6, 30));
        when(contracts.find(tenant, c.id())).thenReturn(Optional.of(c));

        assertThatThrownBy(() -> service.end(new EndCommand(tenant, c.id(), admin, DEC31)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.end(new EndCommand(tenant, c.id(), admin, JAN1.minusDays(1))))
                .isInstanceOf(IllegalArgumentException.class);

        ContractView v = service.end(new EndCommand(tenant, c.id(), admin, LocalDate.of(2026, 3, 15)));
        assertThat(v.contract().status()).isEqualTo(ContractStatus.ENDED);
        assertThat(v.contract().endsOn()).isEqualTo(LocalDate.of(2026, 3, 15));
        assertThat(v.contract().endedBy()).isEqualTo(admin);
    }

    @Test
    void cancelar_exigeCausa_yEsDefinitivo() {
        EmploymentContract c = stored(ContractType.SHIFT, ContractStatus.ACTIVE, JAN1, null);
        when(contracts.find(tenant, c.id())).thenReturn(Optional.of(c));

        assertThatThrownBy(() -> service.cancel(new CancelCommand(tenant, c.id(), admin, "   ")))
                .isInstanceOf(IllegalArgumentException.class);

        ContractView v = service.cancel(new CancelCommand(tenant, c.id(), admin, " Capturado por error "));
        assertThat(v.contract().status()).isEqualTo(ContractStatus.CANCELLED);
        assertThat(v.contract().cancelReason()).isEqualTo("Capturado por error");

        when(contracts.find(tenant, c.id())).thenReturn(Optional.of(v.contract()));
        assertThatThrownBy(() -> service.cancel(new CancelCommand(tenant, c.id(), admin, "otra vez")))
                .isInstanceOf(IllegalStateException.class);
    }

    // ---- RN-65 ----

    @Test
    void listado_marcaPorRevisar_siElProyectoSeAcortoOSeCerro() {
        EmploymentContract fits = stored(ContractType.PROJECT, ContractStatus.ACTIVE, JAN1, LocalDate.of(2026, 6, 30));
        when(contracts.findByUser(tenant, employee)).thenReturn(List.of(fits));

        when(contracts.findProjects(eq(tenant), any())).thenReturn(Map.of(projectId, project("ACTIVE", JAN1, DEC31)));
        assertThat(service.listForUser(tenant, employee).get(0).needsReview()).isFalse();

        // El proyecto se acortó: el contrato ya no cabe.
        when(contracts.findProjects(eq(tenant), any()))
                .thenReturn(Map.of(projectId, project("ACTIVE", JAN1, LocalDate.of(2026, 5, 31))));
        assertThat(service.listForUser(tenant, employee).get(0).needsReview()).isTrue();

        // El proyecto se cerró con el contrato aún activo.
        when(contracts.findProjects(eq(tenant), any())).thenReturn(Map.of(projectId, project("CLOSED", JAN1, DEC31)));
        assertThat(service.listForUser(tenant, employee).get(0).needsReview()).isTrue();
    }
}
