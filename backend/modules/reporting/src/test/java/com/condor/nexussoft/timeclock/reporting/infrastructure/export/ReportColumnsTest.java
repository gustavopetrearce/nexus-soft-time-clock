package com.condor.nexussoft.timeclock.reporting.infrastructure.export;

import com.condor.nexussoft.timeclock.reporting.application.ReportRow;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ReportColumnsTest {

    @Test
    void marcaSinGps_dejaLasCoordenadasVacias() {
        String[] cells = ReportColumns.toCells(new ReportRow(Instant.now(), UUID.randomUUID(),
                "ENTRADA", "ACCEPTED", null, null, null));

        assertThat(cells[5]).isEmpty();
        assertThat(cells[6]).isEmpty();
    }

    @Test
    void marcaConGps_conservaLasCoordenadas() {
        String[] cells = ReportColumns.toCells(new ReportRow(Instant.now(), UUID.randomUUID(),
                "ENTRADA", "ACCEPTED", null, 19.43, -99.13));

        assertThat(cells[5]).isEqualTo("19.43");
        assertThat(cells[6]).isEqualTo("-99.13");
    }
}
