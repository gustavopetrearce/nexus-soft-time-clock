import * as XLSX from 'xlsx';

import { translateOr } from '../../../core/i18n/translate-or';
import { ROLE_LABELS } from '../roles/role.models';
import { ImportRowRequest, ImportedUser } from './user-import.models';

/**
 * Lectura y generación de los archivos de la importación masiva (iteración 15). La estructura está
 * documentada en docs/iteracion-15-importacion-usuarios/01-especificacion.md.
 *
 * El portal solo revisa la FORMA del archivo (encabezados, número de filas) y lo convierte en filas
 * JSON; toda regla de negocio —duplicados, roles otorgables, turnos, cupo— la valida el servidor en
 * la vista previa, para que no haya dos versiones de las reglas que puedan divergir.
 */

export const MAX_IMPORT_ROWS = 1000;
/** 1000 filas con todas las columnas rondan los 300 KB en CSV; 2 MB deja margen sin aceptar cualquier cosa. */
export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;

type Field = Exclude<keyof ImportRowRequest, 'row' | 'roles'> | 'roles';

interface ColumnDef {
  header: string;
  field: Field;
  required: boolean;
  date?: boolean;
  /** Valor de ejemplo para la plantilla. */
  example: string;
}

/** Columnas del archivo, en el orden de la plantilla. */
export const IMPORT_COLUMNS: readonly ColumnDef[] = [
  { header: 'email', field: 'email', required: true, example: 'ana.lopez@empresa.com' },
  { header: 'nombre', field: 'firstName', required: true, example: 'Ana' },
  { header: 'apellidos', field: 'lastName', required: true, example: 'López Hernández' },
  { header: 'numero_empleado', field: 'employeeCode', required: false, example: 'EMP-0001' },
  { header: 'roles', field: 'roles', required: true, example: 'EMPLOYEE' },
  { header: 'telefono', field: 'phone', required: false, example: '5512345678' },
  { header: 'fecha_nacimiento', field: 'birthDate', required: false, date: true, example: '1990-05-21' },
  { header: 'fecha_ingreso', field: 'hireDate', required: false, date: true, example: '2026-01-15' },
  { header: 'genero', field: 'gender', required: false, example: 'FEMALE' },
  { header: 'direccion', field: 'address', required: false, example: '' },
  { header: 'contacto_emergencia_nombre', field: 'emergencyContactName', required: false, example: '' },
  { header: 'contacto_emergencia_telefono', field: 'emergencyContactPhone', required: false, example: '' },
  { header: 'codigo_horario', field: 'scheduleCode', required: false, example: '' },
  { header: 'turno', field: 'shiftName', required: false, example: '' },
  { header: 'codigo_centro', field: 'workSiteCode', required: false, example: '' },
  { header: 'turno_desde', field: 'shiftFrom', required: false, date: true, example: '' },
  { header: 'turno_hasta', field: 'shiftTo', required: false, date: true, example: '' },
];

export type FileProblem =
  | { code: 'UNSUPPORTED_FILE' }
  | { code: 'FILE_TOO_LARGE'; maxMb: number }
  | { code: 'UNREADABLE_FILE' }
  | { code: 'NO_HEADER' }
  | { code: 'MISSING_COLUMNS'; columns: string[] }
  | { code: 'DUPLICATE_COLUMNS'; columns: string[] }
  | { code: 'EMPTY_FILE' }
  | { code: 'TOO_MANY_ROWS'; rows: number; max: number };

export interface ParsedImport {
  rows: ImportRowRequest[];
  /** Encabezados que no son de la plantilla: se ignoran (aviso, no error). */
  unknownColumns: string[];
  problem: FileProblem | null;
}

/** Encabezado comparable: minúsculas, sin acentos, espacios y guiones como `_`. */
export function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function fold(raw: string): string {
  return raw.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Nombre del rol en español → código (`Colaborador` → `EMPLOYEE`), además del código mismo. */
const ROLE_BY_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(ROLE_LABELS).map(([code, label]) => [fold(label), code]),
);

/**
 * La columna `roles` admite códigos (o sus nombres en español) separados por `|`. También se aceptan
 * `,` y `;`, que es lo que escribe quien no leyó la plantilla, siempre que la celda vaya entre comillas.
 */
export function parseRoles(raw: string): string[] {
  return raw
    .split(/[|,;]/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0)
    .map((r) => ROLE_BY_LABEL[fold(r)] ?? r.toUpperCase());
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Fecha a `AAAA-MM-DD`. Una celda de fecha de Excel llega como número de serie; un texto
 * `DD/MM/AAAA` (lo que escribe Excel en español al guardar como CSV) se convierte; cualquier otra
 * cosa se envía tal cual y el servidor la rechaza con su fila y columna.
 */
export function normalizeDate(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  const text = cellText(value);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  return dmy ? `${dmy[3]}-${pad(Number(dmy[2]))}-${pad(Number(dmy[1]))}` : text;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** Separador de un CSV según su primera línea: el que más aparece entre `,`, `;` y tabulador. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (sep: string) => firstLine.split(sep).length - 1;
  return [';', '\t'].reduce((best, sep) => (count(sep) > count(best) ? sep : best), ',');
}

/** Lee el archivo elegido (`.xlsx` o `.csv`) y lo convierte en filas para el servidor. */
export async function readImportFile(file: File): Promise<ParsedImport> {
  const name = file.name.toLowerCase();
  const isCsv = name.endsWith('.csv');
  if (!isCsv && !name.endsWith('.xlsx')) return fail({ code: 'UNSUPPORTED_FILE' });
  if (file.size > MAX_IMPORT_FILE_BYTES) return fail({ code: 'FILE_TOO_LARGE', maxMb: MAX_IMPORT_FILE_BYTES / 1024 / 1024 });

  let matrix: unknown[][];
  try {
    const buffer = await file.arrayBuffer();
    matrix = isCsv ? csvMatrix(buffer) : xlsxMatrix(buffer);
  } catch {
    return fail({ code: 'UNREADABLE_FILE' });
  }
  return parseMatrix(matrix);
}

function fail(problem: FileProblem): ParsedImport {
  return { rows: [], unknownColumns: [], problem };
}

function xlsxMatrix(buffer: ArrayBuffer): unknown[][] {
  const book = XLSX.read(buffer, { type: 'array' });
  const sheet = book.Sheets[book.SheetNames[0]];
  return sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '', blankrows: true }) : [];
}

/**
 * CSV en UTF-8 (con o sin BOM). Se decodifica aquí y no en SheetJS, que leería los bytes con otra
 * página de códigos y rompería acentos y eñes; `raw` evita que convierta `00123` en número.
 */
function csvMatrix(buffer: ArrayBuffer): unknown[][] {
  const text = new TextDecoder('utf-8').decode(buffer).replace(/^﻿/, '');
  const book = XLSX.read(text, { type: 'string', raw: true, FS: detectDelimiter(text) });
  const sheet = book.Sheets[book.SheetNames[0]];
  return sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '', blankrows: true }) : [];
}

/** Convierte la matriz (fila 0 = encabezados) en filas; exportada para las pruebas. */
export function parseMatrix(matrix: unknown[][]): ParsedImport {
  const headerRow = matrix[0] ?? [];
  const headers = headerRow.map(normalizeHeader);
  if (headers.every((h) => !h)) return fail({ code: 'NO_HEADER' });

  const known = new Map(IMPORT_COLUMNS.map((c) => [c.header, c]));
  const duplicated = [...new Set(headers.filter((h, i) => h && headers.indexOf(h) !== i))];
  if (duplicated.length) return fail({ code: 'DUPLICATE_COLUMNS', columns: duplicated });
  const missing = IMPORT_COLUMNS.filter((c) => c.required && !headers.includes(c.header)).map((c) => c.header);
  if (missing.length) return fail({ code: 'MISSING_COLUMNS', columns: missing });
  const unknownColumns = headers.filter((h) => h && !known.has(h));

  const rows: ImportRowRequest[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i] ?? [];
    if (cells.every((c) => cellText(c) === '')) continue;
    const row: ImportRowRequest = { row: i + 1, roles: [] };
    headers.forEach((header, col) => {
      const def = known.get(header);
      if (!def) return;
      const value = cells[col];
      if (def.field === 'roles') {
        row.roles = parseRoles(cellText(value));
        return;
      }
      const text = def.date ? normalizeDate(value) : cellText(value);
      if (text) row[def.field] = text;
    });
    rows.push(row);
  }
  if (!rows.length) return { rows, unknownColumns, problem: { code: 'EMPTY_FILE' } };
  if (rows.length > MAX_IMPORT_ROWS) {
    return { rows: [], unknownColumns, problem: { code: 'TOO_MANY_ROWS', rows: rows.length, max: MAX_IMPORT_ROWS } };
  }
  return { rows, unknownColumns, problem: null };
}

// --- Archivos que se descargan -------------------------------------------------------------------

/** Valores válidos del tenant para la hoja «Catálogos» de la plantilla. */
export interface TemplateCatalogs {
  roles: { code: string; label: string }[];
  genders: { code: string; label: string }[];
  shifts: { scheduleCode: string; scheduleName: string; shiftName: string }[];
  workSites: { code: string; name: string }[];
}

const t = (key: string, fallback: string, params?: Record<string, unknown>) => translateOr(key, fallback, params);

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function templateMatrix(): string[][] {
  return [IMPORT_COLUMNS.map((c) => c.header), IMPORT_COLUMNS.map((c) => c.example)];
}

/** Plantilla `.xlsx`: hoja de usuarios (encabezados + ejemplo), instrucciones y catálogos del tenant. */
export function downloadXlsxTemplate(catalogs: TemplateCatalogs): void {
  const book = XLSX.utils.book_new();
  const users = XLSX.utils.aoa_to_sheet(templateMatrix());
  users['!cols'] = IMPORT_COLUMNS.map((c) => ({ wch: Math.max(c.header.length, c.example.length) + 2 }));
  XLSX.utils.book_append_sheet(book, users, t('userImport.sheet.users', 'Usuarios'));

  const help: string[][] = [[t('userImport.sheet.column', 'Columna'), t('userImport.sheet.required', 'Obligatoria'),
    t('userImport.sheet.description', 'Descripción')]];
  for (const c of IMPORT_COLUMNS) {
    help.push([c.header, c.required ? t('common.yes', 'Sí') : t('common.no', 'No'),
      t(`userImport.columnHelp.${c.header}`, '')]);
  }
  const helpSheet = XLSX.utils.aoa_to_sheet(help);
  helpSheet['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(book, helpSheet, t('userImport.sheet.instructions', 'Instrucciones'));

  const catalog: string[][] = [[
    t('userImport.sheet.roleCode', 'roles'), t('userImport.sheet.roleName', 'Rol'), '',
    t('userImport.sheet.genderCode', 'genero'), t('userImport.sheet.genderName', 'Género'), '',
    'codigo_horario', t('userImport.sheet.scheduleName', 'Horario'), 'turno', '',
    'codigo_centro', t('userImport.sheet.siteName', 'Centro de trabajo'),
  ]];
  const height = Math.max(catalogs.roles.length, catalogs.genders.length, catalogs.shifts.length, catalogs.workSites.length);
  for (let i = 0; i < height; i++) {
    const r = catalogs.roles[i];
    const g = catalogs.genders[i];
    const s = catalogs.shifts[i];
    const w = catalogs.workSites[i];
    catalog.push([r?.code ?? '', r?.label ?? '', '', g?.code ?? '', g?.label ?? '', '',
      s?.scheduleCode ?? '', s?.scheduleName ?? '', s?.shiftName ?? '', '', w?.code ?? '', w?.name ?? '']);
  }
  const catalogSheet = XLSX.utils.aoa_to_sheet(catalog);
  catalogSheet['!cols'] = [{ wch: 16 }, { wch: 26 }, { wch: 2 }, { wch: 14 }, { wch: 20 }, { wch: 2 },
    { wch: 16 }, { wch: 26 }, { wch: 20 }, { wch: 2 }, { wch: 16 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(book, catalogSheet, t('userImport.sheet.catalogs', 'Catálogos'));

  XLSX.writeFile(book, `${t('userImport.templateFile', 'plantilla-usuarios')}.xlsx`);
}

/** Plantilla `.csv` (UTF-8 con BOM para que Excel respete los acentos): encabezados + ejemplo. */
export function downloadCsvTemplate(): void {
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(templateMatrix()));
  downloadText(`﻿${csv}`, `${t('userImport.templateFile', 'plantilla-usuarios')}.csv`, 'text/csv;charset=utf-8');
}

/**
 * Archivo de resultados con las contraseñas temporales. Es la ÚNICA copia en claro: el servidor solo
 * guarda el hash, así que si se pierde habrá que restablecerlas una por una.
 */
export function downloadImportResults(created: ImportedUser[]): void {
  const rows: (string | number)[][] = [
    ['fila', 'email', 'numero_empleado', 'nombre', 'apellidos', 'roles', 'password_temporal'],
    ...created.map((u) => [u.row, u.email, u.employeeCode ?? '', u.firstName, u.lastName, u.roles.join('|'),
      u.temporaryPassword]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 6 }, { wch: 34 }, { wch: 16 }, { wch: 18 }, { wch: 24 }, { wch: 22 }, { wch: 20 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, t('userImport.sheet.results', 'Resultados'));
  XLSX.writeFile(book, `${t('userImport.resultsFile', 'resultado-importacion')}-${stamp()}.xlsx`);
}

function downloadText(content: string, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
