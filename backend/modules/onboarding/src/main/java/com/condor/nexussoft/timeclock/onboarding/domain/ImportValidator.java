package com.condor.nexussoft.timeclock.onboarding.domain;

import com.condor.nexussoft.timeclock.hr.domain.Gender;
import com.condor.nexussoft.timeclock.identity.domain.model.Email;
import com.condor.nexussoft.timeclock.identity.domain.model.RoleGrantPolicy;

import java.text.Normalizer;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static com.condor.nexussoft.timeclock.onboarding.domain.ImportColumns.*;

/**
 * Reglas del archivo de importación (docs/iteracion-15-importacion-usuarios/01-especificacion.md).
 * Es puro: recibe las filas y la foto del tenant ({@link ImportCatalog}) y devuelve todos los
 * errores de una vez, para que el administrador corrija el archivo en una sola pasada.
 *
 * <p>Política todo-o-nada: con un solo error no se escribe nada. Los choques que surjan entre la
 * validación y la escritura (otra alta simultánea con el mismo correo) los siguen frenando las
 * comprobaciones del caso de uso de Identity y los índices únicos, y revierten la transacción.
 */
public final class ImportValidator {

    public static final int MAX_ROWS = 1000;

    static final int MAX_EMAIL = 254;
    static final int MAX_NAME = 120;
    static final int MAX_EMPLOYEE_CODE = 60;
    static final int MAX_PHONE = 40;
    static final int MAX_ADDRESS = 400;
    static final int MAX_EMERGENCY_NAME = 160;

    /** Sinónimos aceptados en la columna {@code genero} (sin acentos, en minúsculas). */
    private static final Map<String, Gender> GENDER_ALIASES = Map.ofEntries(
            Map.entry("female", Gender.FEMALE), Map.entry("f", Gender.FEMALE),
            Map.entry("femenino", Gender.FEMALE), Map.entry("mujer", Gender.FEMALE),
            Map.entry("male", Gender.MALE), Map.entry("m", Gender.MALE),
            Map.entry("masculino", Gender.MALE), Map.entry("hombre", Gender.MALE),
            Map.entry("other", Gender.OTHER), Map.entry("o", Gender.OTHER), Map.entry("otro", Gender.OTHER),
            Map.entry("undisclosed", Gender.UNDISCLOSED), Map.entry("nd", Gender.UNDISCLOSED),
            Map.entry("prefiero no decir", Gender.UNDISCLOSED),
            Map.entry("prefiere no decir", Gender.UNDISCLOSED),
            Map.entry("no especificado", Gender.UNDISCLOSED));

    private ImportValidator() {
    }

    public static ValidationResult validate(List<ImportRow> rows, ImportCatalog catalog) {
        List<ImportIssue> issues = new ArrayList<>();
        if (rows == null || rows.isEmpty()) {
            issues.add(ImportIssue.global("EMPTY_FILE", "El archivo no tiene filas de usuarios."));
            return new ValidationResult(List.of(), issues, 0);
        }
        if (rows.size() > MAX_ROWS) {
            issues.add(ImportIssue.global("TOO_MANY_ROWS",
                    "El archivo tiene " + rows.size() + " filas; el máximo por importación es " + MAX_ROWS + "."));
            return new ValidationResult(List.of(), issues, 0);
        }

        Map<String, Integer> emailsSeen = new HashMap<>();
        Map<String, Integer> codesSeen = new HashMap<>();
        List<ValidatedRow> valid = new ArrayList<>();
        int seats = 0;

        for (ImportRow r : rows) {
            RowCheck c = new RowCheck(r.row(), issues);
            String email = c.email(r.email(), emailsSeen, catalog.existingEmails());
            String firstName = c.requiredText(r.firstName(), FIRST_NAME, MAX_NAME);
            String lastName = c.requiredText(r.lastName(), LAST_NAME, MAX_NAME);
            String employeeCode = c.employeeCode(r.employeeCode(), codesSeen, catalog.existingEmployeeCodes());
            Set<String> roles = c.roles(r.roles(), catalog);
            ValidatedRow.Profile profile = c.profile(r, catalog.today());
            ValidatedRow.Shift shift = c.shift(r, catalog);

            if (c.ok) {
                valid.add(new ValidatedRow(r.row(), email, firstName, lastName, employeeCode, roles, profile, shift));
                if (roles.stream().anyMatch(catalog.seatRoleCodes()::contains)) {
                    seats++;
                }
            }
        }

        if (issues.isEmpty() && seats > catalog.availableSeats()) {
            issues.add(ImportIssue.global("CAPACITY_EXCEEDED", String.format(
                    "La importación habilita %d colaboradores que registran asistencia y el cupo de la "
                            + "empresa solo tiene %d disponibles. Solicite un bloque adicional o reduzca el archivo.",
                    seats, catalog.availableSeats())));
        }
        return new ValidationResult(issues.isEmpty() ? valid : List.of(), issues, seats);
    }

    /** Validación de una fila: acumula sus errores y recuerda si hubo alguno. */
    private static final class RowCheck {
        private final int row;
        private final List<ImportIssue> issues;
        private boolean ok = true;

        RowCheck(int row, List<ImportIssue> issues) {
            this.row = row;
            this.issues = issues;
        }

        void fail(String column, String code, String message) {
            ok = false;
            issues.add(new ImportIssue(row, column, code, message));
        }

        String email(String raw, Map<String, Integer> seen, Set<String> existing) {
            String value = trim(raw);
            if (value == null) {
                fail(EMAIL, "REQUIRED", "El correo es obligatorio.");
                return null;
            }
            if (value.length() > MAX_EMAIL) {
                fail(EMAIL, "TOO_LONG", "El correo supera " + MAX_EMAIL + " caracteres.");
                return null;
            }
            String email;
            try {
                email = Email.of(value).value();
            } catch (IllegalArgumentException e) {
                fail(EMAIL, "INVALID_EMAIL", "El correo «" + value + "» no es válido.");
                return null;
            }
            Integer first = seen.putIfAbsent(email, row);
            if (first != null) {
                fail(EMAIL, "DUPLICATE_IN_FILE", "El correo " + email + " ya aparece en la fila " + first + ".");
            } else if (existing.contains(email)) {
                fail(EMAIL, "DUPLICATE_EMAIL", "Ya existe un usuario con el correo " + email + ".");
            }
            return email;
        }

        String employeeCode(String raw, Map<String, Integer> seen, Set<String> existing) {
            String code = optionalText(raw, EMPLOYEE_CODE, MAX_EMPLOYEE_CODE);
            if (code == null) {
                return null;
            }
            Integer first = seen.putIfAbsent(code, row);
            if (first != null) {
                fail(EMPLOYEE_CODE, "DUPLICATE_IN_FILE",
                        "El número de empleado " + code + " ya aparece en la fila " + first + ".");
            } else if (existing.contains(code)) {
                fail(EMPLOYEE_CODE, "DUPLICATE_EMPLOYEE_CODE",
                        "Ya existe un usuario con el número de empleado " + code + ".");
            }
            return code;
        }

        Set<String> roles(List<String> raw, ImportCatalog catalog) {
            Set<String> roles = new LinkedHashSet<>();
            if (raw != null) {
                for (String r : raw) {
                    String code = trim(r);
                    if (code != null) {
                        roles.add(code.toUpperCase(Locale.ROOT));
                    }
                }
            }
            if (roles.isEmpty()) {
                fail(ROLES, "REQUIRED", "Indique al menos un rol (p. ej. EMPLOYEE).");
                return roles;
            }
            for (String role : roles) {
                if (!catalog.systemRoleCodes().contains(role)) {
                    fail(ROLES, "UNKNOWN_ROLE", "El rol " + role + " no existe.");
                } else if (!RoleGrantPolicy.canGrant(catalog.granter().platformAdmin(),
                        catalog.granter().roleCodes(), role)) {
                    fail(ROLES, "FORBIDDEN_ROLE_GRANT", "No tiene potestad para otorgar el rol " + role + ".");
                }
            }
            return roles;
        }

        ValidatedRow.Profile profile(ImportRow r, LocalDate today) {
            String phone = optionalText(r.phone(), PHONE, MAX_PHONE);
            String address = optionalText(r.address(), ADDRESS, MAX_ADDRESS);
            String emergencyName = optionalText(r.emergencyContactName(), EMERGENCY_NAME, MAX_EMERGENCY_NAME);
            String emergencyPhone = optionalText(r.emergencyContactPhone(), EMERGENCY_PHONE, MAX_PHONE);
            LocalDate birth = date(r.birthDate(), BIRTH_DATE);
            if (birth != null && birth.isAfter(today)) {
                fail(BIRTH_DATE, "FUTURE_DATE", "La fecha de nacimiento no puede ser futura.");
            }
            LocalDate hire = date(r.hireDate(), HIRE_DATE);
            Gender gender = gender(r.gender());
            if (phone == null && address == null && emergencyName == null && emergencyPhone == null
                    && birth == null && hire == null && gender == null) {
                return null;
            }
            return new ValidatedRow.Profile(birth, hire, gender, phone, address, emergencyName, emergencyPhone);
        }

        ValidatedRow.Shift shift(ImportRow r, ImportCatalog catalog) {
            String scheduleCode = trim(r.scheduleCode());
            String shiftName = trim(r.shiftName());
            String siteCode = trim(r.workSiteCode());
            String from = trim(r.shiftFrom());
            String to = trim(r.shiftTo());
            if (scheduleCode == null && shiftName == null && siteCode == null && from == null && to == null) {
                return null;
            }
            if (!catalog.canAssignShifts()) {
                fail(SCHEDULE_CODE, "SHIFT_FORBIDDEN",
                        "No tiene permiso para asignar turnos (schedule:manage): deje vacías las columnas de turno.");
                return null;
            }
            if (scheduleCode == null) {
                fail(SCHEDULE_CODE, "REQUIRED", "Para asignar turno indique el código de horario.");
            }
            if (shiftName == null) {
                fail(SHIFT_NAME, "REQUIRED", "Para asignar turno indique el nombre del turno.");
            }
            if (from == null) {
                fail(SHIFT_FROM, "REQUIRED", "Para asignar turno indique la fecha de inicio.");
            }
            UUID shiftId = scheduleCode != null && shiftName != null
                    ? resolveShift(scheduleCode, shiftName, catalog.shifts()) : null;
            UUID siteId = siteCode == null ? null : resolveWorkSite(siteCode, catalog.workSites());
            LocalDate validFrom = date(from, SHIFT_FROM);
            LocalDate validTo = date(to, SHIFT_TO);
            if (validFrom != null && validTo != null && validTo.isBefore(validFrom)) {
                fail(SHIFT_TO, "INVALID_RANGE", "La fecha de fin del turno es anterior a la de inicio.");
            }
            return shiftId == null || validFrom == null ? null
                    : new ValidatedRow.Shift(shiftId, siteId, validFrom, validTo);
        }

        private UUID resolveShift(String scheduleCode, String shiftName, List<ShiftRef> shifts) {
            Optional<String> schedule = matchCode(scheduleCode,
                    shifts.stream().map(ShiftRef::scheduleCode).distinct().toList(), SCHEDULE_CODE, "horario");
            if (schedule.isEmpty()) {
                return null;
            }
            List<ShiftRef> matches = shifts.stream()
                    .filter(s -> s.scheduleCode().equals(schedule.get()))
                    .filter(s -> fold(s.shiftName()).equals(fold(shiftName)))
                    .toList();
            if (matches.isEmpty()) {
                fail(SHIFT_NAME, "UNKNOWN_SHIFT",
                        "El horario " + schedule.get() + " no tiene un turno llamado «" + shiftName + "».");
                return null;
            }
            if (matches.size() > 1) {
                fail(SHIFT_NAME, "AMBIGUOUS_SHIFT", "El horario " + schedule.get() + " tiene "
                        + matches.size() + " turnos llamados «" + shiftName + "»: renómbrelos para distinguirlos.");
                return null;
            }
            return matches.get(0).shiftId();
        }

        private UUID resolveWorkSite(String code, Map<String, UUID> sites) {
            return matchCode(code, List.copyOf(sites.keySet()), WORK_SITE_CODE, "centro de trabajo")
                    .map(sites::get).orElse(null);
        }

        /**
         * Un código coincide tal cual o, si no, ignorando mayúsculas cuando eso no deja dudas (los
         * códigos son únicos por tenant pero distinguen mayúsculas).
         */
        private Optional<String> matchCode(String code, List<String> known, String column, String what) {
            if (known.contains(code)) {
                return Optional.of(code);
            }
            List<String> folded = known.stream().filter(k -> k.equalsIgnoreCase(code)).toList();
            if (folded.size() == 1) {
                return Optional.of(folded.get(0));
            }
            if (folded.isEmpty()) {
                fail(column, "UNKNOWN_" + (column.equals(SCHEDULE_CODE) ? "SCHEDULE" : "WORK_SITE"),
                        "No existe un " + what + " con el código " + code + ".");
            } else {
                fail(column, "AMBIGUOUS_CODE", "El código " + code + " coincide con varios registros: "
                        + "escríbalo respetando mayúsculas.");
            }
            return Optional.empty();
        }

        private String requiredText(String raw, String column, int max) {
            String value = trim(raw);
            if (value == null) {
                fail(column, "REQUIRED", "La columna " + column + " es obligatoria.");
                return null;
            }
            return checkLength(value, column, max);
        }

        private String optionalText(String raw, String column, int max) {
            String value = trim(raw);
            return value == null ? null : checkLength(value, column, max);
        }

        private String checkLength(String value, String column, int max) {
            if (value.length() > max) {
                fail(column, "TOO_LONG", "La columna " + column + " admite hasta " + max + " caracteres.");
            }
            return value;
        }

        private LocalDate date(String raw, String column) {
            String value = trim(raw);
            if (value == null) {
                return null;
            }
            try {
                return LocalDate.parse(value);
            } catch (DateTimeParseException e) {
                fail(column, "INVALID_DATE", "La fecha «" + value + "» no tiene el formato AAAA-MM-DD.");
                return null;
            }
        }

        private Gender gender(String raw) {
            String value = trim(raw);
            if (value == null) {
                return null;
            }
            Gender gender = GENDER_ALIASES.get(fold(value));
            if (gender == null) {
                fail(GENDER, "INVALID_GENDER",
                        "Género «" + value + "» no reconocido: use FEMALE, MALE, OTHER o UNDISCLOSED.");
            }
            return gender;
        }
    }

    static String trim(String raw) {
        if (raw == null) {
            return null;
        }
        String value = raw.strip();
        return value.isEmpty() ? null : value;
    }

    /** Minúsculas, sin acentos y con espacios colapsados: para comparar nombres escritos a mano. */
    static String fold(String value) {
        String noAccents = Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return noAccents.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }
}
