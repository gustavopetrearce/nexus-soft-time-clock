import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AttendanceReport, LATE_THRESHOLD, SortColumn, SortState } from './report.models';

/** Tipo de filtro por columna (fila de filtros bajo el encabezado, estilo Excel). */
type ColumnFilter = 'text' | 'number' | 'status';

interface ColumnDef {
  key: SortColumn;
  label: string;
  /** Tooltip cuando el encabezado necesita aclaración. */
  hint?: string;
  numeric: boolean;
  /** Tipo de filtro en la fila; sin valor = columna no filtrable. */
  filter?: ColumnFilter;
  /** Nombre del control (texto) o clave del rango numérico dentro de `ranges`. */
  ctrl?: string;
}

const COLUMNS: readonly ColumnDef[] = [
  { key: 'employeeNumber', label: 'reports.col.employeeNumber', hint: 'reports.hint.employeeNumber', numeric: false, filter: 'text', ctrl: 'employeeNumber' },
  { key: 'employeeName', label: 'reports.col.employeeName', numeric: false, filter: 'text', ctrl: 'employeeName' },
  { key: 'workCenter', label: 'reports.col.workCenter', numeric: false, filter: 'text', ctrl: 'workCenter' },
  { key: 'expectedDays', label: 'reports.col.expectedDays', hint: 'reports.hint.expectedDays', numeric: true, filter: 'number', ctrl: 'expectedDays' },
  { key: 'attendedDays', label: 'reports.col.attendedDays', hint: 'reports.hint.attendedDays', numeric: true, filter: 'number', ctrl: 'attendedDays' },
  { key: 'justifiedAbsences', label: 'reports.col.justifiedAbsences', hint: 'reports.hint.justifiedAbsences', numeric: true, filter: 'number', ctrl: 'justifiedAbsences' },
  { key: 'unjustifiedAbsences', label: 'reports.col.unjustifiedAbsences', hint: 'reports.hint.unjustifiedAbsences', numeric: true, filter: 'number', ctrl: 'unjustifiedAbsences' },
  { key: 'lateArrivals', label: 'reports.col.lateArrivals', numeric: true, filter: 'number', ctrl: 'lateArrivals' },
  { key: 'workedHours', label: 'reports.col.workedHours', hint: 'reports.hint.workedHours', numeric: true, filter: 'number', ctrl: 'workedHours' },
  { key: 'overtimeHours', label: 'reports.col.overtimeHours', hint: 'reports.hint.overtimeHours', numeric: true, filter: 'number', ctrl: 'overtimeHours' },
  { key: 'totalHours', label: 'reports.col.totalHours', hint: 'reports.hint.totalHours', numeric: true, filter: 'number', ctrl: 'totalHours' },
  { key: 'active', label: 'reports.col.active', numeric: false, filter: 'status' },
  { key: 'compliancePercentage', label: 'reports.col.compliancePercentage', hint: 'reports.hint.compliancePercentage', numeric: true, filter: 'number', ctrl: 'compliancePercentage' },
];

/**
 * Tabla presentacional del reporte (OnPush + trackBy). Encabezado fijo con orden por clic e
 * indicadores por color. Debajo del encabezado, una fila de filtros siempre visible (estilo Excel):
 * texto "Filtrar…" para columnas de texto, rango Mín/Máx para numéricas y un desplegable para el
 * estado. Los controles están conectados al FormGroup de filtros del componente padre.
 */
@Component({
  selector: 'app-report-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, ReactiveFormsModule, MatIconModule, MatTooltipModule, TranslocoPipe],
  template: `
    <div class="table-wrap">
      <table class="report-table">
        <thead>
          <tr class="head-row">
            @for (col of columns; track col.key) {
              <th
                [class.numeric]="col.numeric"
                [class.sorted]="sort().column === col.key"
                (click)="requestSort(col.key)"
                [matTooltip]="col.hint ? (col.hint | transloco) : ''"
                [matTooltipDisabled]="!col.hint"
              >
                <span class="th-content">
                  {{ col.label | transloco }}
                  <mat-icon class="sort-icon">{{ sortIcon(col.key) }}</mat-icon>
                </span>
              </th>
            }
          </tr>
          <tr class="filter-row">
            @for (col of columns; track col.key) {
              <th [class.numeric]="col.numeric">
                @switch (col.filter) {
                  @case ('text') {
                    <input
                      class="f-input"
                      type="text"
                      [placeholder]="'common.filter' | transloco"
                      autocomplete="off"
                      [formControl]="textCtrl(col.ctrl!)"
                    />
                  }
                  @case ('number') {
                    <div class="f-range">
                      <input class="f-input sm" type="number" [placeholder]="'reports.min' | transloco" [formControl]="rangeCtrl(col.ctrl!, 'min')" />
                      <input class="f-input sm" type="number" [placeholder]="'reports.max' | transloco" [formControl]="rangeCtrl(col.ctrl!, 'max')" />
                    </div>
                  }
                  @case ('status') {
                    <select class="f-select" [formControl]="statusCtrl()">
                      <option value="ALL">{{ 'common.all' | transloco }}</option>
                      <option value="ACTIVE">{{ 'status.ACTIVE' | transloco }}</option>
                      <option value="INACTIVE">{{ 'status.INACTIVE' | transloco }}</option>
                    </select>
                  }
                }
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.employeeNumber) {
            <tr>
              <td class="mono">{{ row.employeeNumber }}</td>
              <td>{{ row.employeeName }}</td>
              <td>{{ row.workCenter }}</td>
              <td class="numeric">{{ row.expectedDays }}</td>
              <td class="numeric">{{ row.attendedDays }}</td>
              <td class="numeric">
                <span class="badge" [class]="absenceTone(row.justifiedAbsences)"
                  [matTooltip]="(row.justifiedAbsences === 0 ? 'reports.tip.noJustified' : 'reports.tip.justified') | transloco: { n: row.justifiedAbsences }">
                  {{ row.justifiedAbsences }}
                </span>
              </td>
              <td class="numeric">
                <span class="badge" [class]="absenceTone(row.unjustifiedAbsences)"
                  [matTooltip]="(row.unjustifiedAbsences === 0 ? 'reports.tip.noUnjustified' : 'reports.tip.unjustified') | transloco: { n: row.unjustifiedAbsences }">
                  {{ row.unjustifiedAbsences }}
                </span>
              </td>
              <td class="numeric">
                <span class="badge" [class]="lateTone(row.lateArrivals)"
                  [matTooltip]="lateTooltip(row.lateArrivals)">
                  {{ row.lateArrivals }}
                </span>
              </td>
              <td class="numeric">{{ row.workedHours | number: '1.0-1' }}</td>
              <td class="numeric">{{ row.overtimeHours | number: '1.0-1' }}</td>
              <td class="numeric strong">{{ row.totalHours | number: '1.0-1' }}</td>
              <td>
                <span class="status-chip" [class]="row.active ? 'success' : 'neutral'">
                  {{ (row.active ? 'status.ACTIVE' : 'status.INACTIVE') | transloco }}
                </span>
              </td>
              <td class="numeric">
                <span class="badge" [class]="complianceTone(row.compliancePercentage)"
                  [matTooltip]="'reports.tip.compliance' | transloco: { n: row.compliancePercentage }">
                  {{ row.compliancePercentage | number: '1.0-1' }}%
                </span>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [
    `
      .report-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        font-size: 0.85rem;
        min-width: 1100px;
      }

      /* --- Encabezado ordenable --- */
      .head-row th {
        position: sticky;
        top: 0;
        z-index: 3;
        height: 40px;
        box-sizing: border-box;
        background: var(--nx-color-surface-subtle);
        color: var(--nx-color-text-secondary);
        font-size: 0.72rem;
        font-weight: var(--nx-font-weight-semibold);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        text-align: left;
        padding: 0 var(--nx-space-3);
        border-bottom: 1px solid var(--nx-color-border-default);
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
        transition: color 0.12s var(--nx-motion-easing-standard);
      }
      .head-row th:hover { color: var(--nx-color-text-primary); }
      .head-row th.sorted { color: var(--nx-color-action-primary); }
      .head-row th.numeric { text-align: right; }
      .th-content { display: inline-flex; align-items: center; gap: 2px; }
      .head-row th.numeric .th-content { flex-direction: row-reverse; }
      .sort-icon { font-size: 16px; width: 16px; height: 16px; opacity: 0.7; }

      /* --- Fila de filtros (siempre visible, estilo Excel) --- */
      .filter-row th {
        position: sticky;
        top: 40px;
        z-index: 2;
        background: color-mix(in srgb, var(--nx-color-surface-subtle) 60%, var(--nx-color-surface-default));
        padding: 6px var(--nx-space-2);
        border-bottom: 1px solid var(--nx-color-border-default);
        vertical-align: middle;
      }
      .f-input,
      .f-select {
        width: 100%;
        box-sizing: border-box;
        padding: 6px 8px;
        border: 1px solid var(--nx-color-border-default);
        border-radius: 8px;
        background: var(--nx-color-surface-default);
        color: var(--nx-color-text-primary);
        font-size: 0.78rem;
        font-family: inherit;
        outline: none;
        transition: border-color 0.12s var(--nx-motion-easing-standard), box-shadow 0.12s var(--nx-motion-easing-standard);
      }
      .f-input:focus,
      .f-select:focus {
        border-color: var(--nx-color-action-primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--nx-color-action-primary) 20%, transparent);
      }
      .f-input::placeholder { color: var(--nx-color-text-disabled); }
      .f-select { cursor: pointer; }
      .f-range { display: flex; gap: 4px; }
      .f-input.sm { padding: 6px 6px; text-align: right; }
      /* Oculta las flechas del input number para un look más limpio */
      .f-input[type='number']::-webkit-outer-spin-button,
      .f-input[type='number']::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      .f-input[type='number'] { -moz-appearance: textfield; appearance: textfield; }

      /* --- Cuerpo --- */
      tbody td {
        padding: var(--nx-space-3) var(--nx-space-3);
        border-bottom: 1px solid var(--nx-color-border-default);
        color: var(--nx-color-text-primary);
        white-space: nowrap;
      }
      tbody td.numeric { text-align: right; font-variant-numeric: tabular-nums; }
      tbody td.mono { font-variant-numeric: tabular-nums; color: var(--nx-color-text-secondary); }
      tbody td.strong { font-weight: var(--nx-font-weight-semibold); }
      tbody tr { transition: background 0.12s var(--nx-motion-easing-standard); animation: fade-in 0.18s var(--nx-motion-easing-standard); }
      tbody tr:nth-child(even) { background: color-mix(in srgb, var(--nx-color-surface-subtle) 55%, transparent); }
      tbody tr:hover { background: var(--nx-color-surface-subtle); }

      .badge {
        display: inline-block;
        min-width: 34px;
        padding: 2px 8px;
        border-radius: var(--nx-radius-full);
        font-size: 0.78rem;
        font-weight: var(--nx-font-weight-semibold);
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      .badge.success { color: var(--nx-color-status-success-fg); background: var(--nx-color-status-success-bg); }
      .badge.warning { color: var(--nx-color-status-warning-fg); background: var(--nx-color-status-warning-bg); }
      .badge.danger { color: var(--nx-color-status-error-fg); background: var(--nx-color-status-error-bg); }
      .badge.neutral { color: var(--nx-color-status-neutral-fg); background: var(--nx-color-status-neutral-bg); }

      @keyframes fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `,
  ],
})
export class ReportTableComponent {
  private readonly transloco = inject(TranslocoService);
  readonly rows = input.required<AttendanceReport[]>();
  readonly sort = input.required<SortState>();
  /** FormGroup de filtros del componente padre (mismo estado que alimenta el filtrado). */
  readonly filters = input.required<FormGroup>();
  readonly sortChange = output<SortColumn>();

  protected readonly columns = COLUMNS;
  protected readonly lateThreshold = computed(() => LATE_THRESHOLD);

  // --- Acceso a los controles del formulario de filtros del padre ---

  protected textCtrl(name: string): FormControl {
    return this.filters().get(name) as FormControl;
  }

  protected rangeCtrl(key: string, bound: 'min' | 'max'): FormControl {
    return this.filters().get(['ranges', key, bound]) as FormControl;
  }

  protected statusCtrl(): FormControl {
    return this.filters().get('status') as FormControl;
  }

  protected requestSort(column: SortColumn): void {
    this.sortChange.emit(column);
  }

  protected sortIcon(column: SortColumn): string {
    if (this.sort().column !== column) {
      return 'unfold_more';
    }
    return this.sort().direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  protected absenceTone(value: number): string {
    return value === 0 ? 'success' : 'danger';
  }

  protected lateTone(value: number): string {
    if (value === 0) {
      return 'neutral';
    }
    return value >= LATE_THRESHOLD ? 'danger' : 'warning';
  }

  protected lateTooltip(value: number): string {
    if (value === 0) {
      return this.transloco.translate('reports.tip.noLate');
    }
    return this.transloco.translate(value >= LATE_THRESHOLD ? 'reports.tip.lateOver' : 'reports.tip.late', {
      n: value,
      threshold: LATE_THRESHOLD,
    });
  }

  protected complianceTone(value: number): string {
    if (value >= 95) {
      return 'success';
    }
    return value >= 80 ? 'warning' : 'danger';
  }
}
