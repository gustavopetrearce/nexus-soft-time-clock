package com.condor.nexussoft.timeclock.tenancy.application;

import com.condor.nexussoft.timeclock.shared.domain.ConflictException;
import com.condor.nexussoft.timeclock.shared.domain.ResourceNotFoundException;
import com.condor.nexussoft.timeclock.tenancy.domain.CapacityStatus;
import com.condor.nexussoft.timeclock.tenancy.domain.Company;
import com.condor.nexussoft.timeclock.tenancy.domain.CompanyCapacity;
import com.condor.nexussoft.timeclock.tenancy.domain.port.out.ActiveCollaboratorCounterPort;
import com.condor.nexussoft.timeclock.tenancy.domain.port.out.CompanyCapacityRepositoryPort;
import com.condor.nexussoft.timeclock.tenancy.domain.port.out.CompanyRepositoryPort;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CompanyCapacityServiceTest {

    @Mock CompanyCapacityRepositoryPort capacities;
    @Mock ActiveCollaboratorCounterPort collaborators;
    @Mock CompanyRepositoryPort companies;

    CompanyCapacityService service;
    final UUID companyId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new CompanyCapacityService(capacities, collaborators, companies);
        // La empresa existe salvo en los tests que digan lo contrario; lenient porque getMany y
        // requireSlot no la consultan.
        lenient().when(companies.findById(companyId)).thenReturn(Optional.of(mock(Company.class)));
    }

    private CompanyCapacity withBlocks(int blocks) {
        return new CompanyCapacity(companyId, 150, 50, blocks);
    }

    // --- get -----------------------------------------------------------

    @Test
    void get_sinBloques_limiteEsElCupoBase() {
        when(capacities.find(companyId)).thenReturn(Optional.of(withBlocks(0)));
        when(collaborators.countActiveCollaborators(companyId)).thenReturn(120L);

        CapacityStatus status = service.get(companyId);

        assertThat(status.limit()).isEqualTo(150);
        assertThat(status.used()).isEqualTo(120);
        assertThat(status.available()).isEqualTo(30);
    }

    @Test
    void get_conDosBloques_acumulaCincuentaPorBloque() {
        when(capacities.find(companyId)).thenReturn(Optional.of(withBlocks(2)));
        when(collaborators.countActiveCollaborators(companyId)).thenReturn(10L);

        assertThat(service.get(companyId).limit()).isEqualTo(250);
    }

    @Test
    void get_empresaSinFilaDeCupo_operaConLaOfertaEstandar() {
        when(capacities.find(companyId)).thenReturn(Optional.empty());
        when(collaborators.countActiveCollaborators(companyId)).thenReturn(5L);

        CapacityStatus status = service.get(companyId);

        assertThat(status.limit()).isEqualTo(150);
        assertThat(status.extraBlocks()).isZero();
    }

    // --- getMany (columna del listado) ---------------------------------

    @Test
    void getMany_resuelveTodaLaPaginaConUnaSolaConsultaYRespetaElOrden() {
        UUID otra = UUID.randomUUID();
        when(capacities.findAll(List.of(companyId, otra)))
                .thenReturn(List.of(new CompanyCapacity(otra, 150, 50, 1)));
        when(collaborators.countActiveCollaboratorsByTenant(List.of(companyId, otra)))
                .thenReturn(Map.of(otra, 180L));

        List<CapacityStatus> result = service.getMany(List.of(companyId, otra));

        assertThat(result).hasSize(2);
        // La primera no tiene fila ni colaboradores: oferta estándar y consumo cero.
        assertThat(result.get(0).companyId()).isEqualTo(companyId);
        assertThat(result.get(0).limit()).isEqualTo(150);
        assertThat(result.get(0).used()).isZero();
        assertThat(result.get(1).limit()).isEqualTo(200);
        assertThat(result.get(1).available()).isEqualTo(20);
        verify(collaborators, never()).countActiveCollaborators(any());
    }

    @Test
    void getMany_sinIds_noConsultaNada() {
        assertThat(service.getMany(List.of())).isEmpty();
        verifyNoInteractions(capacities, collaborators);
    }

    // --- requireSlotForNewCollaborator ---------------------------------

    @Test
    void requireSlot_conCupoDisponible_noLanza() {
        when(capacities.findForUpdate(companyId)).thenReturn(Optional.of(withBlocks(0)));
        when(collaborators.countActiveCollaborators(companyId)).thenReturn(149L);

        service.requireSlotForNewCollaborator(companyId);   // el colaborador 150 entra
    }

    @Test
    void requireSlot_colaborador151SinBloque_rechaza() {
        when(capacities.findForUpdate(companyId)).thenReturn(Optional.of(withBlocks(0)));
        when(collaborators.countActiveCollaborators(companyId)).thenReturn(150L);

        assertThatThrownBy(() -> service.requireSlotForNewCollaborator(companyId))
                .isInstanceOf(ConflictException.class)
                .extracting(e -> ((ConflictException) e).getCode())
                .isEqualTo("CAPACITY_EXCEEDED");
    }

    @Test
    void requireSlot_colaborador151ConUnBloque_entra() {
        when(capacities.findForUpdate(companyId)).thenReturn(Optional.of(withBlocks(1)));
        when(collaborators.countActiveCollaborators(companyId)).thenReturn(150L);

        service.requireSlotForNewCollaborator(companyId);
    }

    @Test
    void requireSlot_bloqueaLaFilaDelCupoNoSoloLaLee() {
        when(capacities.findForUpdate(companyId)).thenReturn(Optional.of(withBlocks(0)));
        when(collaborators.countActiveCollaborators(companyId)).thenReturn(0L);

        service.requireSlotForNewCollaborator(companyId);

        // Sin FOR UPDATE, dos altas simultáneas en el límite leen el mismo conteo y pasan ambas.
        verify(capacities).findForUpdate(companyId);
        verify(capacities, never()).find(companyId);
    }

    // --- setExtraBlocks ------------------------------------------------

    @Test
    void setExtraBlocks_ampliacion_persisteYDevuelveElNuevoLimite() {
        when(capacities.findForUpdate(companyId)).thenReturn(Optional.of(withBlocks(0)));
        when(collaborators.countActiveCollaborators(companyId)).thenReturn(150L);
        when(capacities.save(any(), any())).thenAnswer(inv -> inv.getArgument(0));
        UUID actor = UUID.randomUUID();

        CapacityStatus status = service.setExtraBlocks(companyId, 2, actor);

        assertThat(status.limit()).isEqualTo(250);
        assertThat(status.extraBlocks()).isEqualTo(2);
        verify(capacities).save(any(), any());
    }

    @Test
    void setExtraBlocks_reduccionPorDebajoDelUso_rechazaYNoPersiste() {
        when(capacities.findForUpdate(companyId)).thenReturn(Optional.of(withBlocks(2)));
        when(collaborators.countActiveCollaborators(companyId)).thenReturn(220L);

        assertThatThrownBy(() -> service.setExtraBlocks(companyId, 0, UUID.randomUUID()))
                .isInstanceOf(ConflictException.class)
                .extracting(e -> ((ConflictException) e).getCode())
                .isEqualTo("CAPACITY_BELOW_USAGE");
        verify(capacities, never()).save(any(), any());
    }

    @Test
    void setExtraBlocks_reduccionQueSigueCubriendoElUso_ok() {
        when(capacities.findForUpdate(companyId)).thenReturn(Optional.of(withBlocks(3)));
        when(collaborators.countActiveCollaborators(companyId)).thenReturn(160L);
        when(capacities.save(any(), any())).thenAnswer(inv -> inv.getArgument(0));

        CapacityStatus status = service.setExtraBlocks(companyId, 1, UUID.randomUUID());

        assertThat(status.limit()).isEqualTo(200);
    }

    // --- empresa inexistente ---------------------------------------------

    @Test
    void get_empresaInexistente_lanzaNotFound() {
        UUID otra = UUID.randomUUID();
        when(companies.findById(otra)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.get(otra)).isInstanceOf(ResourceNotFoundException.class);
        verifyNoInteractions(capacities, collaborators);
    }

    @Test
    void setExtraBlocks_empresaInexistente_lanzaNotFoundSinPersistir() {
        UUID otra = UUID.randomUUID();
        when(companies.findById(otra)).thenReturn(Optional.empty());

        // Antes acababa en un 500 por la FK de company_capacity.
        assertThatThrownBy(() -> service.setExtraBlocks(otra, 1, UUID.randomUUID()))
                .isInstanceOf(ResourceNotFoundException.class);
        verifyNoInteractions(capacities, collaborators);
    }
}
