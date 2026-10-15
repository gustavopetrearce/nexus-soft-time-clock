package com.condor.nexussoft.timeclock.tenancy.domain;

import com.condor.nexussoft.timeclock.shared.domain.DomainException;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CompanyCapacityTest {

    final UUID companyId = UUID.randomUUID();

    @Test
    void limite_esElBaseMasBloquesCompletos() {
        assertThat(CompanyCapacity.defaultsFor(companyId).limit()).isEqualTo(150);
        assertThat(CompanyCapacity.defaultsFor(companyId).withExtraBlocks(1).limit()).isEqualTo(200);
        assertThat(CompanyCapacity.defaultsFor(companyId).withExtraBlocks(5).limit()).isEqualTo(400);
    }

    @Test
    void bloquesNecesarios_redondeaHaciaArribaPorqueElBloqueEsIndivisible() {
        CompanyCapacity capacity = CompanyCapacity.defaultsFor(companyId);

        assertThat(capacity.blocksNeededFor(150)).isZero();
        assertThat(capacity.blocksNeededFor(151)).isEqualTo(1);   // un solo colaborador de más ya pide bloque
        assertThat(capacity.blocksNeededFor(200)).isEqualTo(1);
        assertThat(capacity.blocksNeededFor(201)).isEqualTo(2);
    }

    @Test
    void bloquesNegativos_seRechazan() {
        assertThatThrownBy(() -> CompanyCapacity.defaultsFor(companyId).withExtraBlocks(-1))
                .isInstanceOf(DomainException.class)
                .extracting(e -> ((DomainException) e).getCode())
                .isEqualTo("INVALID_CAPACITY");
    }
}
