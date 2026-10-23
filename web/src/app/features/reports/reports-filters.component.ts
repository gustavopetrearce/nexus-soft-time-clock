import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';

/** Definición declarativa de un filtro de rango numérico (etiqueta + nombre del subgrupo). */
interface RangeField {
  key: string;
  /** Clave de traducción. */
  label: string;
}

const RANGE_FIELDS: readonly RangeField[] = [
  { key: 'expectedDays', label: 'reports.field.expectedDays' },
  { key: 'attendedDays', label: 'reports.field.attendedDays' },
  { key: 'justifiedAbsences', label: 'reports.field.justifiedAbsences' },
  { key: 'unjustifiedAbsences', label: 'reports.field.unjustifiedAbsences' },
  { key: 'lateArrivals', label: 'reports.field.lateArrivals' },
  { key: 'workedHours', label: 'reports.field.workedHours' },
  { key: 'overtimeHours', label: 'reports.field.overtimeHours' },
  { key: 'totalHours', label: 'reports.field.totalHours' },
  { key: 'compliancePercentage', label: 'reports.field.compliancePercentage' },
];

/**
 * Contenido de filtros avanzados (reutilizable, presentacional). Vive dentro del drawer de
 * app-reports; el {@link FormGroup} que recibe del padre es la única fuente de verdad.
 */
@Component({
  selector: 'app-report-filters',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, TranslocoPipe],
  template: `
    <div [formGroup]="form()">
      <div class="detail-section-title">{{ 'reports.filters.employee' | transloco }}</div>
      <div class="filters-grid">
        <mat-form-field appearance="outline" class="drawer-field">
          <mat-label>{{ 'reports.field.employeeNumber' | transloco }}</mat-label>
          <input matInput formControlName="employeeNumber" autocomplete="off" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="drawer-field">
          <mat-label>{{ 'common.name' | transloco }}</mat-label>
          <input matInput formControlName="employeeName" autocomplete="off" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="drawer-field">
          <mat-label>{{ 'attendanceEvents.col.site' | transloco }}</mat-label>
          <input matInput formControlName="workCenter" autocomplete="off" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="drawer-field">
          <mat-label>{{ 'common.status' | transloco }}</mat-label>
          <mat-select formControlName="status">
            <mat-option value="ALL">{{ 'common.all' | transloco }}</mat-option>
            <mat-option value="ACTIVE">{{ 'reports.filters.active' | transloco }}</mat-option>
            <mat-option value="INACTIVE">{{ 'reports.filters.inactive' | transloco }}</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <div class="detail-section-title">{{ 'reports.filters.ranges' | transloco }}</div>
      <div class="ranges-grid" formGroupName="ranges">
        @for (f of rangeFields; track f.key) {
          <div class="range-item" [formGroupName]="f.key">
            <span class="range-label">{{ f.label | transloco }}</span>
            <div class="range-inputs">
              <mat-form-field appearance="outline" class="range-field">
                <mat-label>{{ 'reports.min' | transloco }}</mat-label>
                <input matInput type="number" formControlName="min" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="range-field">
                <mat-label>{{ 'reports.max' | transloco }}</mat-label>
                <input matInput type="number" formControlName="max" />
              </mat-form-field>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .filters-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--sp-1);
        margin-bottom: var(--sp-2);
      }
      .ranges-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--sp-3);
      }
      .range-item { display: flex; flex-direction: column; gap: 4px; }
      .range-label { font-size: var(--font-small); font-weight: 600; color: var(--text-muted); }
      .range-inputs { display: flex; gap: var(--sp-2); }
      .range-field { flex: 1; }
      mat-form-field { width: 100%; }
    `,
  ],
})
export class ReportFiltersComponent {
  /** FormGroup provisto por el padre (fuente de verdad). */
  readonly form = input.required<FormGroup>();

  protected readonly rangeFields = RANGE_FIELDS;
}
