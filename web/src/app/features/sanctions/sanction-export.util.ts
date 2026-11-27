import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { translateOr } from '../../core/i18n/translate-or';
import { Sanction } from './sanction.models';

/** Texto en el idioma activo; la clave hace de respaldo si Transloco no está disponible. */
const t = (key: string, params?: Record<string, unknown>) => translateOr(key, key, params);

const HEADER_KEYS: readonly string[] = [
  'reports.field.employeeNumber',
  'sanctions.collaborator',
  'sanctions.incidentDate',
  'sanctions.type',
  'sanctions.reason',
  'sanctions.description',
  'sanctions.suspension',
  'common.status',
  'sanctions.issuedBy',
  'sanctions.voidReason',
];

/** dd/MM/yyyy desde yyyy-MM-dd, sin pasar por Date (evita el corrimiento de zona horaria). */
function dmy(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function toRow(s: Sanction): (string | number)[] {
  return [
    s.employeeCode ?? '',
    s.userName ?? s.userId,
    dmy(s.incidentDate),
    t(`sanctions.types.${s.type}`),
    t(`sanctions.reasons.${s.reason}`),
    s.description,
    s.type === 'SUSPENSION' ? `${dmy(s.suspensionStart)} – ${dmy(s.suspensionEnd)} (${s.suspensionDays})` : '',
    t(`sanctions.status.${s.status}`),
    s.issuedByName ?? '',
    s.voidReason ?? '',
  ];
}

function fileName(): string {
  return `${t('sanctions.fileName')}-${new Date().toISOString().slice(0, 10)}`;
}

export function exportSanctionsToExcel(rows: Sanction[]): void {
  const sheet = XLSX.utils.aoa_to_sheet([HEADER_KEYS.map((k) => t(k)), ...rows.map(toRow)]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, t('sanctions.sheet'));
  XLSX.writeFile(book, `${fileName()}.xlsx`);
}

export function exportSanctionsToPdf(rows: Sanction[]): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.text(t('layout.nav.sanctions'), 40, 40);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(t('attendanceEvents.count', { n: rows.length }), 40, 58);
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
export function exportSanctionsToCsv(rows: Sanction[]): void {
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
