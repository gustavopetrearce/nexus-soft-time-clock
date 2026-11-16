package com.condor.nexussoft.timeclock.organization.domain;

import com.condor.nexussoft.timeclock.shared.domain.DomainException;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProjectTest {

    private static final LocalDate D = LocalDate.of(2026, 11, 16);

    @Test
    void crear_conFinAnteriorAlInicio_falla() {
        assertThatThrownBy(() -> Project.create(UUID.randomUUID(), "P1", "Obra", D, D.minusDays(1)))
                .isInstanceOf(DomainException.class);
    }

    @Test
    void crear_conExtremosAbiertos_oMismoDia_esValido() {
        assertThat(Project.create(UUID.randomUUID(), "P1", "Obra", null, D).endsOn()).isEqualTo(D);
        assertThat(Project.create(UUID.randomUUID(), "P2", "Obra", D, null).startsOn()).isEqualTo(D);
        assertThat(Project.create(UUID.randomUUID(), "P3", "Obra", D, D).endsOn()).isEqualTo(D);
    }

    @Test
    void editar_conFinAnteriorAlInicio_fallaSinCambiarNada() {
        Project p = Project.create(UUID.randomUUID(), "P1", "Obra", D, D.plusDays(30));

        assertThatThrownBy(() -> p.update("Otro", Project.Status.CLOSED, D, D.minusDays(1)))
                .isInstanceOf(DomainException.class);
        assertThat(p.name()).isEqualTo("Obra");
        assertThat(p.status()).isEqualTo(Project.Status.ACTIVE);
    }
}
