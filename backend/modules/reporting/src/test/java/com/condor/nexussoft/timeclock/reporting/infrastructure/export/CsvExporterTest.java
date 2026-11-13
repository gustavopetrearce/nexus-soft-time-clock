package com.condor.nexussoft.timeclock.reporting.infrastructure.export;

import com.condor.nexussoft.timeclock.reporting.application.ReportRow;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class CsvExporterTest {

    private final CsvExporter exporter = new CsvExporter();

    @Test
    void export_incluyeEncabezadoYFilas() {
        UUID userId = UUID.randomUUID();
        List<ReportRow> rows = List.of(new ReportRow(
                Instant.parse("2026-07-21T10:00:00Z"), userId, "ENTRADA", "ACCEPTED", null, 19.4326, -99.1332, null));

        String csv = new String(exporter.export(rows), StandardCharsets.UTF_8);

        assertThat(csv).contains("Fecha (servidor),Usuario,Evento,Estado");
        assertThat(csv).contains("ENTRADA");
        assertThat(csv).contains("ACCEPTED");
        assertThat(csv).contains(userId.toString());
    }
}
