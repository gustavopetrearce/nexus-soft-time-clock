package com.condor.nexussoft.timeclock.attendance.application;

import com.condor.nexussoft.timeclock.attendance.domain.BreakType;
import com.condor.nexussoft.timeclock.attendance.domain.port.in.BreakTypeCatalogUseCase.BreakTypeDraft;
import com.condor.nexussoft.timeclock.attendance.domain.port.out.BreakTypePort;
import com.condor.nexussoft.timeclock.shared.domain.DomainException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BreakTypeCatalogServiceTest {

    @Mock
    private BreakTypePort port;

    private BreakTypeCatalogService service;
    private final UUID tenantId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new BreakTypeCatalogService(port);
    }

    @Test
    void crear_normalizaElCodigoYRecortaLaEtiqueta() {
        when(port.save(any())).thenAnswer(inv -> inv.getArgument(0));

        BreakType created = service.create(tenantId, new BreakTypeDraft(" almuerzo ", "  Almuerzo ", true, false, 60, 0));

        assertThat(created.code()).isEqualTo("ALMUERZO");
        assertThat(created.label()).isEqualTo("Almuerzo");
        assertThat(created.tenantId()).isEqualTo(tenantId);
    }

    @Test
    void crear_conCodigoInvalido_esRechazado() {
        assertThatThrownBy(() -> service.create(tenantId, new BreakTypeDraft("café", "Café", true, false, null, 0)))
                .isInstanceOf(DomainException.class)
                .extracting(e -> ((DomainException) e).getCode())
                .isEqualTo("INVALID_CODE");
    }

    @Test
    void crear_conCodigoDuplicado_esRechazado() {
        when(port.existsCode(tenantId, "COMIDA", null)).thenReturn(true);

        assertThatThrownBy(() -> service.create(tenantId, new BreakTypeDraft("comida", "Comida", true, false, null, 0)))
                .isInstanceOf(DomainException.class)
                .extracting(e -> ((DomainException) e).getCode())
                .isEqualTo("DUPLICATE_CODE");
        verify(port, never()).save(any());
    }

    @Test
    void borrar_categoriaEnUso_soloLaDesactiva() {
        UUID id = UUID.randomUUID();
        when(port.findById(tenantId, id)).thenReturn(Optional.of(
                new BreakType(id, tenantId, "ALMUERZO", "Almuerzo", true, false, 60, 0)));
        when(port.isInUse(tenantId, id)).thenReturn(true);

        boolean deleted = service.delete(tenantId, id);

        assertThat(deleted).isFalse();
        ArgumentCaptor<BreakType> saved = ArgumentCaptor.forClass(BreakType.class);
        verify(port).save(saved.capture());
        assertThat(saved.getValue().enabled()).isFalse();
        verify(port, never()).delete(any(), any());
    }

    @Test
    void borrar_categoriaSinUso_laElimina() {
        UUID id = UUID.randomUUID();
        when(port.findById(tenantId, id)).thenReturn(Optional.of(
                new BreakType(id, tenantId, "CAFE", "Café", true, true, 15, 1)));

        assertThat(service.delete(tenantId, id)).isTrue();
        verify(port).delete(tenantId, id);
    }
}
