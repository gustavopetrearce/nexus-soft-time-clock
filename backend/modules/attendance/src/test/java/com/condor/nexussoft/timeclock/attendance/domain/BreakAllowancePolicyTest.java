package com.condor.nexussoft.timeclock.attendance.domain;

import com.condor.nexussoft.timeclock.attendance.domain.BreakAllowancePolicy.Allowance;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class BreakAllowancePolicyTest {

    private final UUID almuerzo = UUID.randomUUID();
    private final UUID comida = UUID.randomUUID();

    @Test
    void sinRestriccion_niUso_todoDisponible() {
        assertThat(BreakAllowancePolicy.check(almuerzo, Allowance.unrestricted())).isEmpty();
    }

    @Test
    void turnoRestringido_soloSusCategorias() {
        Allowance vespertino = new Allowance(true, Set.of(comida), Set.of());
        assertThat(BreakAllowancePolicy.check(almuerzo, vespertino)).contains(RejectionReason.BREAK_NOT_ALLOWED_FOR_SHIFT);
        assertThat(BreakAllowancePolicy.check(comida, vespertino)).isEmpty();
    }

    @Test
    void turnoRestringidoSinCategorias_noAdmiteDescansos() {
        Allowance nocturno = new Allowance(true, Set.of(), Set.of());
        assertThat(BreakAllowancePolicy.availability(comida, nocturno))
                .isEqualTo(BreakAllowancePolicy.Availability.NOT_ALLOWED_FOR_SHIFT);
    }

    @Test
    void categoriaYaUsadaHoy_seRechaza() {
        Allowance a = new Allowance(true, Set.of(almuerzo, comida), Set.of(almuerzo));
        assertThat(BreakAllowancePolicy.check(almuerzo, a)).contains(RejectionReason.BREAK_ALREADY_USED);
        assertThat(BreakAllowancePolicy.check(comida, a)).isEmpty();
    }

    @Test
    void descansoGenerico_sinCategoria_noTieneLimite() {
        Allowance a = new Allowance(true, Set.of(), Set.of());
        assertThat(BreakAllowancePolicy.check(null, a)).isEmpty();
    }
}
