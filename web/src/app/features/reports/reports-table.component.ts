import { ChangeDetectionStrategy, Component, computed, input, output, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AppNumberPipe } from '../../core/i18n/app-number.pipe';
import { ScrollDirective } from '../../core/ui/scroll.directive';
import { AttendanceReport, LATE_THRESHOLD, SortColumn, SortState } from './report.models';

/** Tipo de filtro por columna (fila de filtros bajo el encabezado, estilo Excel). */
type ColumnFilter = 'text' | 'number' | 'status';

type Tone = 'success' | 'warning' | 'error' | 'neutral';

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
 * Tabla del reporte (DS/09 n.º 20, HIFI/08 R5): encabezado con orden por clic y, debajo, la fila de
 * filtros siempre visible (texto «Filtrar…», rango Mín/Máx o estado), conectada al FormGroup del
 * padre. Cifras a la derecha con text-numeric; chips por umbral (retardos ≥ LATE_THRESHOLD en
 * error, % de cumplimiento ≥ 95 success y ≥ 80 warning).
 */
@Component({
  selector: 'app-report-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule, MatTooltipModule, TranslocoPipe, AppNumberPipe, ScrollDirective],
  template: `
    <div class="nx-tabla">
      <div class="nx-tabla__scroll nx-scroll" nxScroll>
        <table>
          <thead>
            <tr>
              @for (col of columns; track col.key) {
                <th
                  scope="col"
                  [class.num]="col.numeric"
                  [attr.aria-sort]="ariaSort(col.key)"
                  [matTooltip]="col.hint ? (col.hint | transloco) : ''"
                  [matTooltipDisabled]="!col.hint"
                >
                  <button type="button" class="nx-th orden" (click)="requestSort(col.key)">
                    {{ col.label | transloco }}
                    <mat-icon class="nx-orden" [class.is-on]="sort().column === col.key" aria-hidden="true">{{ sortIcon(col.key) }}</mat-icon>
                  </button>
                </th>
              }
            </tr>
            <tr class="nx-fila-filtros">
              @for (col of columns; track col.key) {
                <th class="nx-filtro-col">
                  @switch (col.filter) {
                    @case ('text') {
                      <input
                        class="nx-campo__caja nx-mini"
                        type="text"
                        [placeholder]="'common.filter' | transloco"
                        [attr.aria-label]="col.label | transloco"
                        autocomplete="off"
                        [formControl]="textCtrl(col.ctrl!)"
                      />
                    }
                    @case ('number') {
                      <span class="nx-rango">
                        <input class="nx-campo__caja nx-mini" type="number" [placeholder]="'reports.min' | transloco"
                          [attr.aria-label]="(col.label | transloco) + ' · ' + ('reports.min' | transloco)" [formControl]="rangeCtrl(col.ctrl!, 'min')" />
                        <input class="nx-campo__caja nx-mini" type="number" [placeholder]="'reports.max' | transloco"
                          [attr.aria-label]="(col.label | transloco) + ' · ' + ('reports.max' | transloco)" [formControl]="rangeCtrl(col.ctrl!, 'max')" />
                      </span>
                    }
                    @case ('status') {
                      <select class="nx-campo__caja nx-mini" [formControl]="statusCtrl()" [attr.aria-label]="col.label | transloco">
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
                <td class="nx-text-code">{{ row.employeeNumber }}</td>
                <td><span class="nx-trunc">{{ row.employeeName }}</span></td>
                <td><span class="nx-trunc">{{ row.workCenter }}</span></td>
                <td class="num nx-text-numeric">{{ row.expectedDays | appNumber }}</td>
                <td class="num nx-text-numeric">{{ row.attendedDays | appNumber }}</td>
                <td class="num nx-text-numeric">
                  <span class="nx-chip nx-chip--{{ absenceTone(row.justifiedAbsences) }}"
                    [matTooltip]="(row.justifiedAbsences === 0 ? 'reports.tip.noJustified' : 'reports.tip.justified') | transloco: { n: row.justifiedAbsences }">
                    {{ row.justifiedAbsences | appNumber }}
                  </span>
                </td>
                <td class="num nx-text-numeric">
                  <span class="nx-chip nx-chip--{{ absenceTone(row.unjustifiedAbsences) }}"
                    [matTooltip]="(row.unjustifiedAbsences === 0 ? 'reports.tip.noUnjustified' : 'reports.tip.unjustified') | transloco: { n: row.unjustifiedAbsences }">
                    {{ row.unjustifiedAbsences | appNumber }}
                  </span>
                </td>
                <td class="num nx-text-numeric">
                  <span class="nx-chip nx-chip--{{ lateTone(row.lateArrivals) }}" [matTooltip]="lateTooltip(row.lateArrivals)">
                    {{ row.lateArrivals | appNumber }}
                  </span>
                </td>
                <td class="num nx-text-numeric">{{ row.workedHours | appNumber: 1 }}</td>
                <td class="num nx-text-numeric">{{ row.overtimeHours | appNumber: 1 }}</td>
                <td class="num nx-text-numeric"><b>{{ row.totalHours | appNumber: 1 }}</b></td>
                <td>
                  <span class="nx-chip nx-chip--{{ row.active ? 'success' : 'neutral' }}">
                    {{ (row.active ? 'status.ACTIVE' : 'status.INACTIVE') | transloco }}
                  </span>
                </td>
                <td class="num nx-text-numeric">
                  <span class="nx-chip nx-chip--{{ complianceTone(row.compliancePercentage) }}"
                    [matTooltip]="'reports.tip.compliance' | transloco: { n: row.compliancePercentage }">
                    {{ row.compliancePercentage | appNumber: 1 }}%
                  </span>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [
    `
      /* El encabezado ordenable es un botón que hereda la tipografía de la celda. */
      .orden {
        padding: var(--nx-space-0);
        border: 0;
        background: transparent;
        font: inherit;
        letter-spacing: inherit;
        text-transform: inherit;
        color: inherit;
        cursor: pointer;
      }
      .orden mat-icon { width: var(--nx-icon-size-sm); height: var(--nx-icon-size-sm); font-size: var(--nx-icon-size-sm); }
      th.num .orden { flex-direction: row-reverse; }
      th[aria-sort] .orden { color: var(--nx-color-action-primary); }
      /* Filtros de 32 visibles dentro de un área de 40 (HIFI/08 R5). */
      .nx-fila-filtros th { padding-block: var(--nx-space-1); }
      input.nx-mini,
      select.nx-mini {
        width: 100%;
        background-color: var(--nx-color-surface-default);
        font-family: inherit;
        text-transform: none;
        letter-spacing: var(--nx-font-tracking-normal);
      }
      input.nx-mini::placeholder { color: var(--nx-color-text-placeholder); }
      .nx-rango input.nx-mini { text-align: right; -moz-appearance: textfield; appearance: textfield; }
      .nx-rango input.nx-mini::-webkit-outer-spin-button,
      .nx-rango input.nx-mini::-webkit-inner-spin-button { -webkit-appearance: none; margin: var(--nx-space-0); }
      td { white-space: nowrap; }
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

  protected ariaSort(column: SortColumn): 'ascending' | 'descending' | null {
    if (this.sort().column !== column) return null;
    return this.sort().direction === 'asc' ? 'ascending' : 'descending';
  }

  protected sortIcon(column: SortColumn): string {
    if (this.sort().column !== column) {
      return 'unfold_more';
    }
    return this.sort().direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  protected absenceTone(value: number): Tone {
    return value === 0 ? 'success' : 'error';
  }

  protected lateTone(value: number): Tone {
    if (value === 0) {
      return 'neutral';
    }
    return value >= LATE_THRESHOLD ? 'error' : 'warning';
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

  protected complianceTone(value: number): Tone {
    if (value >= 95) {
      return 'success';
    }
    return value >= 80 ? 'warning' : 'error';
  }
}
