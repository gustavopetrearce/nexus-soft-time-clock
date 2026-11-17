package com.condor.nexussoft.timeclock.reporting;

import com.condor.nexussoft.timeclock.reporting.application.AttendanceRecordRow;
import com.condor.nexussoft.timeclock.reporting.application.AttendanceReportService;
import com.condor.nexussoft.timeclock.reporting.application.AttendanceSummaryRow;
import com.condor.nexussoft.timeclock.reporting.application.AttendanceSummaryService;
import com.condor.nexussoft.timeclock.reporting.application.ProjectHoursRow;
import com.condor.nexussoft.timeclock.reporting.application.ProjectHoursService;
import com.condor.nexussoft.timeclock.reporting.application.SiteHoursRow;
import com.condor.nexussoft.timeclock.reporting.application.SiteHoursService;
import com.condor.nexussoft.timeclock.support.PostgisIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Reportes por proyecto y días esperados según contrato (iteración 14, fase 3), contra el SQL real.
 * Las marcas se insertan con su {@code project_id} ya resuelto: la atribución la prueba
 * {@code ContractAttendanceIT}; aquí, la agregación.
 */
class ProjectReportsIT extends PostgisIntegrationTest {

    /** Semana de lunes 24 a viernes 28 de agosto de 2026: 5 días hábiles. */
    private static final LocalDate LUNES = LocalDate.of(2026, 8, 24);
    private static final LocalDate VIERNES = LUNES.plusDays(4);

    @Autowired
    private ProjectHoursService projectHours;
    @Autowired
    private AttendanceSummaryService summary;
    @Autowired
    private SiteHoursService siteHours;
    @Autowired
    private AttendanceReportService records;
    @Autowired
    private JdbcTemplate jdbc;

    private UUID tenantId;
    private UUID userId;
    private UUID site;
    private UUID obra;
    private UUID torre;
    private String suffix;

    @BeforeEach
    void seed() {
        tenantId = UUID.randomUUID();
        userId = UUID.randomUUID();
        site = UUID.randomUUID();
        suffix = tenantId.toString().substring(0, 8);

        jdbc.update("INSERT INTO companies (id, code, name) VALUES (?, ?, 'Empresa de prueba')",
                tenantId, "PR-" + suffix);
        jdbc.update("INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name) "
                        + "VALUES (?, ?, ?, 'x', 'Ada', 'Lovelace')",
                userId, tenantId, "ada-" + suffix + "@example.com");
        jdbc.update("INSERT INTO work_sites (id, tenant_id, code, name, location) "
                        + "VALUES (?, ?, ?, 'Centro A', ST_SetSRID(ST_MakePoint(-99.1332, 19.4326), 4326)::geography)",
                site, tenantId, "A-" + suffix);
        obra = project("OBRA", "Obra norte");
        torre = project("TORRE", "Torre sur");
    }

    @Test
    void horasPorProyecto_separaCadaProyectoYLasHorasSinProyecto() {
        jornada(LUNES, 8, 16, obra);            // 8 h en la obra
        jornada(LUNES.plusDays(1), 9, 13, torre); // 4 h en la torre
        jornada(LUNES.plusDays(2), 9, 11, null);  // 2 h sin proyecto

        assertThat(projectHours.byProject(tenantId, LUNES, VIERNES, null)).containsExactly(
                new ProjectHoursRow("—", "Ada Lovelace", "OBRA-" + suffix, "Obra norte", 8.0, 0.0, 8.0),
                new ProjectHoursRow("—", "Ada Lovelace", "TORRE-" + suffix, "Torre sur", 4.0, 0.0, 4.0),
                new ProjectHoursRow("—", "Ada Lovelace", null, null, 2.0, 0.0, 2.0));
        assertThat(projectHours.byProject(tenantId, LUNES, VIERNES, torre)).extracting(ProjectHoursRow::totalHours)
                .containsExactly(4.0);
    }

    /** Con filtro solo cuentan sus marcas, y solo se le espera en los días de su contrato con él. */
    @Test
    void resumenPorProyecto_cuentaSusHorasYLosDiasDeSuContrato() {
        contract("PROJECT", obra, LUNES, LUNES.plusDays(2));                  // lun-mié
        contract("PROJECT", torre, LUNES.plusDays(3), VIERNES);              // jue-vie
        jornada(LUNES, 8, 16, obra);
        jornada(LUNES.plusDays(3), 8, 12, torre);

        AttendanceSummaryRow row = only(summary.summary(tenantId, LUNES, VIERNES, obra));

        assertThat(row.expectedDays()).isEqualTo(3);
        assertThat(row.attendedDays()).isEqualTo(1);
        assertThat(row.workedHours()).isEqualTo(8.0);
        assertThat(siteHours.byWorkSite(tenantId, LUNES, VIERNES, obra))
                .extracting(SiteHoursRow::totalHours).containsExactly(8.0);
    }

    /** Sin contrato ni marcas con ese proyecto, el colaborador no aparece en su reporte. */
    @Test
    void resumenPorProyecto_excluyeAQuienNoTuvoNadaQueVerConEl() {
        contract("PROJECT", torre, LUNES, VIERNES);

        assertThat(summary.summary(tenantId, LUNES, VIERNES, obra)).isEmpty();
    }

    /** Fuera de contrato no se le espera: el contrato por turno empieza el miércoles. */
    @Test
    void diasEsperados_seAcotanALosContratos() {
        contract("SHIFT", null, LUNES.plusDays(2), null);

        assertThat(only(summary.summary(tenantId, LUNES, VIERNES)).expectedDays()).isEqualTo(3);
    }

    /** Un contrato cancelado no cuenta: sin otro, se vuelve al cálculo sin contratos. */
    @Test
    void diasEsperados_ignoranLosContratosCancelados() {
        jdbc.update("INSERT INTO employment_contracts (tenant_id, user_id, contract_type, starts_on, ends_on, "
                        + "status, cancel_reason) VALUES (?, ?, 'SHIFT', ?, ?, 'CANCELLED', 'error de captura')",
                tenantId, userId, Date.valueOf(LUNES), Date.valueOf(LUNES));

        assertThat(only(summary.summary(tenantId, LUNES, VIERNES)).expectedDays()).isEqualTo(5);
    }

    /** Antes de su ingreso no se le espera. */
    @Test
    void diasEsperados_empiezanEnLaFechaDeIngreso() {
        jdbc.update("INSERT INTO employee_profiles (user_id, tenant_id, hire_date) VALUES (?, ?, ?)",
                userId, tenantId, Date.valueOf(LUNES.plusDays(3)));

        assertThat(only(summary.summary(tenantId, LUNES, VIERNES)).expectedDays()).isEqualTo(2);
    }

    @Test
    void registros_seFiltranPorProyectoYMuestranCual() {
        jornada(LUNES, 8, 16, obra);
        jornada(LUNES.plusDays(1), 8, 16, null);

        List<AttendanceRecordRow> rows = records.records(tenantId,
                LUNES.atStartOfDay().toInstant(ZoneOffset.UTC),
                VIERNES.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC), null, obra);

        assertThat(rows).hasSize(2)
                .extracting(AttendanceRecordRow::project).containsOnly("OBRA-" + suffix + " · Obra norte");
    }

    // --- utilidades ------------------------------------------------------------------------

    private static AttendanceSummaryRow only(List<AttendanceSummaryRow> rows) {
        assertThat(rows).hasSize(1);
        return rows.get(0);
    }

    private UUID project(String code, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO projects (id, tenant_id, code, name, starts_on) VALUES (?, ?, ?, ?, ?)",
                id, tenantId, code + "-" + suffix, name, Date.valueOf(LUNES.minusDays(30)));
        return id;
    }

    private void contract(String type, UUID projectId, LocalDate start, LocalDate end) {
        jdbc.update("INSERT INTO employment_contracts (tenant_id, user_id, contract_type, project_id, starts_on, ends_on) "
                        + "VALUES (?, ?, ?, ?, ?, ?)",
                tenantId, userId, type, projectId, Date.valueOf(start), end == null ? null : Date.valueOf(end));
    }

    private void jornada(LocalDate dia, int entrada, int salida, UUID projectId) {
        marca("ENTRADA", dia, entrada, projectId);
        marca("SALIDA", dia, salida, projectId);
    }

    private void marca(String eventType, LocalDate dia, int hora, UUID projectId) {
        jdbc.update("INSERT INTO attendance_records (id, tenant_id, server_time, user_id, work_site_id, "
                        + "project_id, event_type, status, location, gps_accuracy_m, operation_uuid, source) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, 'ACCEPTED', "
                        + "ST_SetSRID(ST_MakePoint(-99.1332, 19.4326), 4326)::geography, 10, ?, 'ONLINE')",
                UUID.randomUUID(), tenantId,
                Timestamp.from(dia.atTime(hora, 0).toInstant(ZoneOffset.UTC)),
                userId, site, projectId, eventType, UUID.randomUUID());
    }
}
