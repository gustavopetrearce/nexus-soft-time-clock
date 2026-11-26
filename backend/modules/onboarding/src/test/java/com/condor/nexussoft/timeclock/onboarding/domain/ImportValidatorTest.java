package com.condor.nexussoft.timeclock.onboarding.domain;

import com.condor.nexussoft.timeclock.hr.domain.Gender;
import com.condor.nexussoft.timeclock.identity.domain.port.in.GranterAuthority;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ImportValidatorTest {

    static final UUID SHIFT_MATUTINO = UUID.randomUUID();
    static final UUID SHIFT_DUP_A = UUID.randomUUID();
    static final UUID SHIFT_DUP_B = UUID.randomUUID();
    static final UUID SITE_CENTRO = UUID.randomUUID();
    static final LocalDate TODAY = LocalDate.of(2026, 11, 26);

    static final GranterAuthority COMPANY_ADMIN = new GranterAuthority(false, Set.of("COMPANY_ADMIN"));
    static final GranterAuthority HR_ADMIN = new GranterAuthority(false, Set.of("HR_ADMIN"));

    static ImportCatalog catalog(GranterAuthority granter, boolean canAssignShifts, long seats,
                                 Set<String> existingEmails, Set<String> existingCodes) {
        return new ImportCatalog(existingEmails, existingCodes,
                Set.of("SUPER_ADMIN", "COMPANY_ADMIN", "HR_ADMIN", "SUPERVISOR", "AUDITOR", "EMPLOYEE"),
                Set.of("EMPLOYEE"), seats,
                List.of(new ShiftRef("HOR-01", "Matutino", SHIFT_MATUTINO),
                        new ShiftRef("HOR-02", "Nocturno", SHIFT_DUP_A),
                        new ShiftRef("HOR-02", "nocturno", SHIFT_DUP_B)),
                Map.of("CENTRO", SITE_CENTRO), granter, canAssignShifts, TODAY);
    }

    static ImportCatalog defaultCatalog() {
        return catalog(COMPANY_ADMIN, true, 100, Set.of(), Set.of());
    }

    static ImportRow row(int n, String email, String code, String... roles) {
        return new ImportRow(n, email, "Ana", "Pérez", code, List.of(roles), null, null, null, null, null,
                null, null, null, null, null, null, null);
    }

    static ImportRow withShift(ImportRow r, String schedule, String shift, String site, String from, String to) {
        return new ImportRow(r.row(), r.email(), r.firstName(), r.lastName(), r.employeeCode(), r.roles(),
                r.phone(), r.birthDate(), r.hireDate(), r.gender(), r.address(), r.emergencyContactName(),
                r.emergencyContactPhone(), schedule, shift, site, from, to);
    }

    static ImportRow withProfile(ImportRow r, String phone, String birth, String hire, String gender) {
        return new ImportRow(r.row(), r.email(), r.firstName(), r.lastName(), r.employeeCode(), r.roles(),
                phone, birth, hire, gender, null, null, null, r.scheduleCode(), r.shiftName(),
                r.workSiteCode(), r.shiftFrom(), r.shiftTo());
    }

    static List<String> codes(ValidationResult r) {
        return r.issues().stream().map(ImportIssue::code).toList();
    }

    @Test
    void archivoValido_normalizaYResuelve() {
        ImportRow r = withProfile(withShift(row(2, "  Ana@Demo.COM ", " E-1 ", "employee"),
                "hor-01", " matutino ", "centro", "2026-12-01", null), "555", "1990-05-01", "2026-01-10", "Femenino");

        ValidationResult result = ImportValidator.validate(List.of(r), defaultCatalog());

        assertThat(result.issues()).isEmpty();
        ValidatedRow v = result.rows().get(0);
        assertThat(v.email()).isEqualTo("ana@demo.com");
        assertThat(v.employeeCode()).isEqualTo("E-1");
        assertThat(v.roles()).containsExactly("EMPLOYEE");
        assertThat(v.profile().gender()).isEqualTo(Gender.FEMALE);
        assertThat(v.profile().birthDate()).isEqualTo(LocalDate.of(1990, 5, 1));
        assertThat(v.shift().shiftId()).isEqualTo(SHIFT_MATUTINO);
        assertThat(v.shift().workSiteId()).isEqualTo(SITE_CENTRO);
        assertThat(result.seatsNeeded()).isEqualTo(1);
    }

    @Test
    void sinPerfilNiTurno_quedanNulos() {
        ValidationResult result = ImportValidator.validate(List.of(row(2, "a@demo.com", null, "SUPERVISOR")),
                defaultCatalog());

        assertThat(result.rows().get(0).profile()).isNull();
        assertThat(result.rows().get(0).shift()).isNull();
        assertThat(result.seatsNeeded()).isZero();
    }

    @Test
    void obligatoriosVacios_reportaCadaColumna() {
        ImportRow r = new ImportRow(2, " ", "", null, null, List.of(" "), null, null, null, null, null,
                null, null, null, null, null, null, null);

        ValidationResult result = ImportValidator.validate(List.of(r), defaultCatalog());

        assertThat(result.valid()).isFalse();
        assertThat(result.rows()).isEmpty();
        assertThat(result.issues()).extracting(ImportIssue::column)
                .containsExactlyInAnyOrder("email", "nombre", "apellidos", "roles");
    }

    @Test
    void duplicadosEnArchivoYEnTenant() {
        List<ImportRow> rows = List.of(
                row(2, "a@demo.com", "E-1", "EMPLOYEE"),
                row(3, "A@demo.com", "E-1", "EMPLOYEE"),
                row(4, "ya@demo.com", "E-9", "EMPLOYEE"));

        ValidationResult result = ImportValidator.validate(rows,
                catalog(COMPANY_ADMIN, true, 100, Set.of("ya@demo.com"), Set.of("E-9")));

        assertThat(result.issues()).extracting(ImportIssue::row, ImportIssue::code).containsExactlyInAnyOrder(
                org.assertj.core.groups.Tuple.tuple(3, "DUPLICATE_IN_FILE"),
                org.assertj.core.groups.Tuple.tuple(3, "DUPLICATE_IN_FILE"),
                org.assertj.core.groups.Tuple.tuple(4, "DUPLICATE_EMAIL"),
                org.assertj.core.groups.Tuple.tuple(4, "DUPLICATE_EMPLOYEE_CODE"));
    }

    @Test
    void rolNoOtorgableOInexistente() {
        List<ImportRow> rows = List.of(
                row(2, "a@demo.com", null, "COMPANY_ADMIN"),
                row(3, "b@demo.com", null, "HR_ADMIN"),
                row(4, "c@demo.com", null, "GERENTE"));

        ValidationResult result = ImportValidator.validate(rows, catalog(HR_ADMIN, true, 100, Set.of(), Set.of()));

        // HR_ADMIN (rango 60) no otorga COMPANY_ADMIN (80) ni su propio rango (60).
        assertThat(result.issues()).extracting(ImportIssue::row, ImportIssue::code).containsExactly(
                org.assertj.core.groups.Tuple.tuple(2, "FORBIDDEN_ROLE_GRANT"),
                org.assertj.core.groups.Tuple.tuple(3, "FORBIDDEN_ROLE_GRANT"),
                org.assertj.core.groups.Tuple.tuple(4, "UNKNOWN_ROLE"));
    }

    @Test
    void formatosInvalidos() {
        ImportRow r = withProfile(row(2, "no-es-correo", null, "EMPLOYEE"), null, "01/05/1990", "2030-01-01", "x");
        ImportRow futuro = withProfile(row(3, "b@demo.com", null, "EMPLOYEE"), null, "2027-01-01", null, null);

        ValidationResult result = ImportValidator.validate(List.of(r, futuro), defaultCatalog());

        assertThat(codes(result)).containsExactlyInAnyOrder("INVALID_EMAIL", "INVALID_DATE", "INVALID_GENDER",
                "FUTURE_DATE");
    }

    @Test
    void textoDemasiadoLargo() {
        ImportRow r = new ImportRow(2, "a@demo.com", "x".repeat(121), "Pérez", "c".repeat(61), List.of("EMPLOYEE"),
                "9".repeat(41), null, null, null, null, null, null, null, null, null, null, null);

        ValidationResult result = ImportValidator.validate(List.of(r), defaultCatalog());

        assertThat(result.issues()).extracting(ImportIssue::column)
                .containsExactlyInAnyOrder("nombre", "numero_empleado", "telefono");
        assertThat(codes(result)).containsOnly("TOO_LONG");
    }

    @Test
    void turno_errores() {
        List<ImportRow> rows = List.of(
                withShift(row(2, "a@demo.com", null, "EMPLOYEE"), "HOR-99", "Matutino", null, "2026-12-01", null),
                withShift(row(3, "b@demo.com", null, "EMPLOYEE"), "HOR-01", "Vespertino", null, "2026-12-01", null),
                withShift(row(4, "c@demo.com", null, "EMPLOYEE"), "HOR-02", "Nocturno", null, "2026-12-01", null),
                withShift(row(5, "d@demo.com", null, "EMPLOYEE"), "HOR-01", "Matutino", "NOPE", "2026-12-01", null),
                withShift(row(6, "e@demo.com", null, "EMPLOYEE"), "HOR-01", "Matutino", null, "2026-12-01", "2026-11-01"),
                withShift(row(7, "f@demo.com", null, "EMPLOYEE"), null, null, "CENTRO", null, null));

        ValidationResult result = ImportValidator.validate(rows, defaultCatalog());

        assertThat(result.issues()).extracting(ImportIssue::row, ImportIssue::code).containsExactlyInAnyOrder(
                org.assertj.core.groups.Tuple.tuple(2, "UNKNOWN_SCHEDULE"),
                org.assertj.core.groups.Tuple.tuple(3, "UNKNOWN_SHIFT"),
                org.assertj.core.groups.Tuple.tuple(4, "AMBIGUOUS_SHIFT"),
                org.assertj.core.groups.Tuple.tuple(5, "UNKNOWN_WORK_SITE"),
                org.assertj.core.groups.Tuple.tuple(6, "INVALID_RANGE"),
                org.assertj.core.groups.Tuple.tuple(7, "REQUIRED"),
                org.assertj.core.groups.Tuple.tuple(7, "REQUIRED"),
                org.assertj.core.groups.Tuple.tuple(7, "REQUIRED"));
    }

    @Test
    void turno_sinPermiso() {
        ImportRow r = withShift(row(2, "a@demo.com", null, "EMPLOYEE"), "HOR-01", "Matutino", null, "2026-12-01", null);

        ValidationResult result = ImportValidator.validate(List.of(r), catalog(COMPANY_ADMIN, false, 100, Set.of(), Set.of()));

        assertThat(codes(result)).containsExactly("SHIFT_FORBIDDEN");
    }

    @Test
    void cupoInsuficiente_errorGlobal() {
        List<ImportRow> rows = List.of(
                row(2, "a@demo.com", null, "EMPLOYEE"),
                row(3, "b@demo.com", null, "EMPLOYEE"),
                row(4, "c@demo.com", null, "AUDITOR"));

        ValidationResult result = ImportValidator.validate(rows, catalog(COMPANY_ADMIN, true, 1, Set.of(), Set.of()));

        assertThat(result.seatsNeeded()).isEqualTo(2);
        assertThat(result.issues()).singleElement().satisfies(i -> {
            assertThat(i.row()).isZero();
            assertThat(i.code()).isEqualTo("CAPACITY_EXCEEDED");
        });
    }

    @Test
    void archivoVacioODemasiadoGrande() {
        assertThat(codes(ImportValidator.validate(List.of(), defaultCatalog()))).containsExactly("EMPTY_FILE");

        List<ImportRow> many = new ArrayList<>();
        for (int i = 0; i <= ImportValidator.MAX_ROWS; i++) {
            many.add(row(i + 2, "u" + i + "@demo.com", null, "AUDITOR"));
        }
        assertThat(codes(ImportValidator.validate(many, defaultCatalog()))).containsExactly("TOO_MANY_ROWS");
    }
}
