import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { translateOr } from '../../core/i18n/translate-or';
import { Permit, permitPhase } from './permit.models';

/** Texto en el idioma activo; la clave hace de respaldo si Transloco no está disponible. */
const t = (key: string, params?: Record<string, unknown>) => translateOr(key, key, params);

const HEADER_KEYS: readonly string[] = [
  'reports.field.employeeNumber',
  'permits.collaborator',
  'period.from',
  'period.to',
  'permits.days',
  'permits.pay',
  'permits.decidedBy',
  'common.status',
  'permits.phase.label',
  'permits.grantedBy',
  'permits.notes',
];

/** dd/MM/yyyy desde yyyy-MM-dd, sin pasar por Date (evita el corrimiento de zona horaria). */
function dmy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function toRow(p: Permit): (string | number)[] {
  const phase = permitPhase(p);
  return [
    p.employeeCode ?? '',
    p.userName ?? p.userId,
    dmy(p.startDate),
    dmy(p.endDate),
    p.days,
    t(`permits.payStatus.${p.payStatus}`),
    p.payDecidedByName ?? '',
    t(`permits.status.${p.status}`),
    phase ? t(`permits.phase.${phase}`) : '',
    p.grantedByName ?? '',
    p.notes ?? '',
  ];
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function fileName(): string {
  return `${t('permits.incapacities.fileName')}-${stamp()}`;
}

export function exportIncapacitiesToExcel(rows: Permit[]): void {
  const sheet = XLSX.utils.aoa_to_sheet([HEADER_KEYS.map((k) => t(k)), ...rows.map(toRow)]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, t('permits.incapacities.sheet'));
  XLSX.writeFile(book, `${fileName()}.xlsx`);
}

export function exportIncapacitiesToPdf(rows: Permit[], range?: { from: string; to: string }): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.text(t('permits.incapacities.title'), 40, 40);
  doc.setFontSize(10);
  doc.setTextColor(120);
  const count = t('attendanceEvents.count', { n: rows.length });
  const subtitle = range?.from && range?.to
    ? `${t('reports.pdfPeriod', { from: dmy(range.from), to: dmy(range.to) })}  ·  ${count}`
    : count;
  doc.text(subtitle, 40, 58);
  autoTable(doc, {
    startY: 72,
    head: [HEADER_KEYS.map((k) => t(k))],
    body: rows.map(toRow),
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [57, 73, 171], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [244, 246, 251] },
    margin: { left: 40, right: 40 },
  });
  doc.save(`${fileName()}.pdf`);
}

/** CSV UTF-8 con BOM, para que Excel respete los acentos. */
export function exportIncapacitiesToCsv(rows: Permit[]): void {
  const cell = (v: string | number) => {
    const text = String(v);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [HEADER_KEYS.map((k) => t(k)), ...rows.map(toRow)].map((r) => r.map(cell).join(','));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
