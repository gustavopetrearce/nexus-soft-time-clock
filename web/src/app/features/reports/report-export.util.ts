import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { translateOr } from '../../core/i18n/translate-or';
import { AttendanceReport } from './report.models';

/** Claves de los encabezados, en el orden de las columnas del reporte. */
const HEADER_KEYS: readonly string[] = [
  'reports.field.employeeNumber',
  'common.name',
  'attendanceEvents.col.site',
  'reports.field.expectedDays',
  'reports.field.attendedDays',
  'reports.field.justifiedAbsences',
  'reports.field.unjustifiedAbsences',
  'reports.field.lateArrivals',
  'reports.field.workedHours',
  'reports.field.overtimeHours',
  'reports.field.totalHours',
  'common.status',
  'reports.field.compliancePercentage',
];

/** Texto en el idioma activo; la clave hace de respaldo si Transloco no está disponible. */
const t = (key: string, params?: Record<string, unknown>) => translateOr(key, key, params);

function headers(): string[] {
  return HEADER_KEYS.map((k) => t(k));
}

function toRow(r: AttendanceReport): (string | number)[] {
  return [
    r.employeeNumber,
    r.employeeName,
    r.workCenter,
    r.expectedDays,
    r.attendedDays,
    r.justifiedAbsences,
    r.unjustifiedAbsences,
    r.lateArrivals,
    r.workedHours,
    r.overtimeHours,
    r.totalHours,
    t(r.active ? 'status.ACTIVE' : 'status.INACTIVE'),
    r.compliancePercentage,
  ];
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Exporta las filas dadas (ya filtradas) a un archivo .xlsx. */
export function exportToExcel(rows: AttendanceReport[]): void {
  const data: (string | number)[][] = [headers(), ...rows.map(toRow)];
  const sheet = XLSX.utils.aoa_to_sheet(data);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, t('reports.sheet'));
  XLSX.writeFile(book, `${t('reports.fileName')}-${stamp()}.xlsx`);
}

/** Exporta las filas dadas (ya filtradas) a un archivo .pdf horizontal. */
export function exportToPdf(rows: AttendanceReport[], range?: { from: string; to: string }): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFontSize(14);
  doc.text(t('reports.pdfTitle'), 40, 40);
  doc.setFontSize(10);
  doc.setTextColor(120);
  const count = t('attendanceEvents.count', { n: rows.length });
  const subtitle = range ? `${t('reports.pdfPeriod', { from: range.from, to: range.to })}  ·  ${count}` : count;
  doc.text(subtitle, 40, 58);

  autoTable(doc, {
    startY: 72,
    head: [headers()],
    body: rows.map(toRow),
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [57, 73, 171], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [244, 246, 251] },
    margin: { left: 40, right: 40 },
  });

  doc.save(`${t('reports.fileName')}-${stamp()}.pdf`);
}
