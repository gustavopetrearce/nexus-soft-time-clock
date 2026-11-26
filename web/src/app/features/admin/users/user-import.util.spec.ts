import * as XLSX from 'xlsx';

import {
  MAX_IMPORT_ROWS,
  detectDelimiter,
  normalizeDate,
  normalizeHeader,
  parseMatrix,
  parseRoles,
  readImportFile,
} from './user-import.util';

describe('user-import.util', () => {
  const HEAD = ['email', 'nombre', 'apellidos', 'roles'];

  it('normaliza encabezados escritos a mano', () => {
    expect(normalizeHeader(' Número Empleado ')).toBe('numero_empleado');
    expect(normalizeHeader('Fecha-Ingreso')).toBe('fecha_ingreso');
    expect(normalizeHeader('EMAIL')).toBe('email');
  });

  it('lee roles por código o por nombre, con varios separadores', () => {
    expect(parseRoles('EMPLOYEE|supervisor')).toEqual(['EMPLOYEE', 'SUPERVISOR']);
    expect(parseRoles('Colaborador, Auditor')).toEqual(['EMPLOYEE', 'AUDITOR']);
    expect(parseRoles(' ; ')).toEqual([]);
  });

  it('convierte fechas de Excel y DD/MM/AAAA a ISO', () => {
    expect(normalizeDate(46357)).toBe('2026-12-01');
    expect(normalizeDate('1/5/1990')).toBe('1990-05-01');
    expect(normalizeDate('2026-01-15')).toBe('2026-01-15');
    expect(normalizeDate('mañana')).toBe('mañana');
  });

  it('detecta el separador del CSV', () => {
    expect(detectDelimiter('email;nombre;apellidos;roles\na;b;c;d')).toBe(';');
    expect(detectDelimiter('email,nombre,apellidos,roles')).toBe(',');
    expect(detectDelimiter('email\tnombre\tapellidos')).toBe('\t');
  });

  it('convierte filas, numera como en el archivo y salta las vacías', () => {
    const parsed = parseMatrix([
      [...HEAD, 'numero_empleado', 'genero', 'extra'],
      ['ana@demo.com', 'Ana', 'López', 'EMPLOYEE', 123, 'F', 'x'],
      ['', '', '', '', '', '', ''],
      ['luis@demo.com', ' Luis ', 'Gómez', 'Supervisor|Colaborador', '', '', ''],
    ]);

    expect(parsed.problem).toBeNull();
    expect(parsed.unknownColumns).toEqual(['extra']);
    expect(parsed.rows.length).toBe(2);
    expect(parsed.rows[0]).toEqual(jasmine.objectContaining({ row: 2, email: 'ana@demo.com', employeeCode: '123', gender: 'F' }));
    expect(parsed.rows[1]).toEqual(jasmine.objectContaining({ row: 4, firstName: 'Luis', roles: ['SUPERVISOR', 'EMPLOYEE'] }));
    expect(parsed.rows[1].employeeCode).toBeUndefined();
  });

  it('rechaza archivos sin columnas obligatorias, con columnas repetidas o vacíos', () => {
    expect(parseMatrix([['email', 'nombre']]).problem).toEqual({ code: 'MISSING_COLUMNS', columns: ['apellidos', 'roles'] });
    expect(parseMatrix([[...HEAD, 'Email']]).problem).toEqual({ code: 'DUPLICATE_COLUMNS', columns: ['email'] });
    expect(parseMatrix([HEAD]).problem).toEqual({ code: 'EMPTY_FILE' });
    expect(parseMatrix([]).problem).toEqual({ code: 'NO_HEADER' });
  });

  it('limita el número de filas', () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => [`u${i}@demo.com`, 'N', 'A', 'EMPLOYEE']);
    expect(parseMatrix([HEAD, ...rows]).problem?.code).toBe('TOO_MANY_ROWS');
  });

  it('lee un CSV UTF-8 con BOM, punto y coma y acentos', async () => {
    const csv = '﻿email;nombre;apellidos;roles;numero_empleado\nana@demo.com;Ana;Núñez;EMPLOYEE;00123\n';
    const parsed = await readImportFile(new File([csv], 'usuarios.csv', { type: 'text/csv' }));

    expect(parsed.problem).toBeNull();
    expect(parsed.rows[0]).toEqual(jasmine.objectContaining({ lastName: 'Núñez', employeeCode: '00123' }));
  });

  it('lee la primera hoja de un XLSX', async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([HEAD, ['ana@demo.com', 'Ana', 'Pérez', 'EMPLOYEE']]), 'Usuarios');
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const parsed = await readImportFile(new File([bytes], 'usuarios.xlsx'));

    expect(parsed.rows.length).toBe(1);
    expect(parsed.rows[0].lastName).toBe('Pérez');
  });

  it('rechaza otros formatos', async () => {
    const parsed = await readImportFile(new File(['x'], 'usuarios.xls'));
    expect(parsed.problem).toEqual({ code: 'UNSUPPORTED_FILE' });
  });
});
