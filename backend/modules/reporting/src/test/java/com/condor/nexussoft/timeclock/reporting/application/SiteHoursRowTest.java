package com.condor.nexussoft.timeclock.reporting.application;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SiteHoursRowTest {

    @Test
    void of_convierteMinutosAHorasYSumaElTotal() {
        SiteHoursRow row = SiteHoursRow.of("E-1", "Ada Lovelace", "Centro A", 390, 30);

        assertThat(row.workedHours()).isEqualTo(6.5);
        assertThat(row.overtimeHours()).isEqualTo(0.5);
        assertThat(row.totalHours()).isEqualTo(7.0);
    }

    @Test
    void of_redondeaAUnDecimal() {
        SiteHoursRow row = SiteHoursRow.of("E-2", "Bob Martin", "Centro B", 100, 0);

        assertThat(row.workedHours()).isEqualTo(1.7);   // 1.666… h
        assertThat(row.totalHours()).isEqualTo(1.7);
    }

    /** El total se suma sobre las horas ya redondeadas, para que cuadre con lo que se muestra. */
    @Test
    void of_sinExtras_elTotalEsLoTrabajado() {
        SiteHoursRow row = SiteHoursRow.of("E-3", "Grace Hopper", "Centro C", 210, 0);

        assertThat(row.workedHours()).isEqualTo(3.5);
        assertThat(row.overtimeHours()).isZero();
        assertThat(row.totalHours()).isEqualTo(3.5);
    }
}
