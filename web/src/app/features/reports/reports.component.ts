import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { NotificationService } from '../../core/ui/notification.service';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { exportToExcel, exportToPdf } from './report-export.util';
import { generateMockReport } from './report.mock';
import {
  AttendanceReport,
  NumericColumn,
  ReportFilters,
  SortColumn,
  SortState,
  countActiveFilters,
  defaultFilters,
} from './report.models';
import { ReportService } from './report.service';
import { ReportTableComponent } from './reports-table.component';

const NUMERIC_COLUMNS: readonly NumericColumn[] = [
  'expectedDays', 'attendedDays', 'justifiedAbsences', 'unjustifiedAbsences',
  'lateArrivals', 'workedHours', 'overtimeHours', 'totalHours', 'compliancePercentage',
];

/**
 * Reporte de asistencia por colaborador (RF-11). Carga el agregado del backend para un rango de
 * fechas y aplica búsqueda, filtros por columna (embudo estilo Excel en cada encabezado),
 * ordenamiento y paginación en el cliente. Exporta a Excel/PDF respetando los filtros activos.
 * Si el backend no responde, muestra datos de demostración.
 */
@Component({
  selector: 'app-reports',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatPaginatorModule,
    PageHeaderComponent,
    EmptyStateComponent,
    ReportTableComponent,
    TranslocoPipe,
  ],
  template: `
    <app-page-header [title]="'reports.title' | transloco" [subtitle]="'reports.subtitle' | transloco" />

    <div class="split-layout">
      <div class="split-main">
        <mat-card>
          <mat-card-content>
            <!-- Barra superior de acciones -->
            <div class="toolbar" [formGroup]="form">
              <mat-form-field appearance="outline" class="search">
                <mat-icon matPrefix>search</mat-icon>
                <mat-label>{{ 'reports.search' | transloco }}</mat-label>
                <input matInput formControlName="search" autocomplete="off" />
              </mat-form-field>

              <div class="dates">
                <mat-form-field appearance="outline" class="date">
                  <mat-label>{{ 'scheduling.from' | transloco }}</mat-label>
                  <input matInput type="date" formControlName="from" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="date">
                  <mat-label>{{ 'period.to' | transloco }}</mat-label>
                  <input matInput type="date" formControlName="to" />
                </mat-form-field>
              </div>

              <span class="spacer"></span>

              <div class="toolbar-actions">
                <button mat-stroked-button type="button" (click)="clearFilters()" [disabled]="activeFilters() === 0">
                  <mat-icon>filter_alt_off</mat-icon> {{ 'common.clearFilters' | transloco }}
                  @if (activeFilters() > 0) { <span class="filter-badge">{{ activeFilters() }}</span> }
                </button>
                <button mat-stroked-button type="button" (click)="export('excel')" [disabled]="filtered().length === 0">
                  <mat-icon>grid_on</mat-icon> Excel
                </button>
                <button mat-stroked-button type="button" (click)="export('pdf')" [disabled]="filtered().length === 0">
                  <mat-icon>picture_as_pdf</mat-icon> PDF
                </button>
              </div>
            </div>

            <!-- Indicadores -->
            <div class="indicators">
              <span class="count">
                <strong>{{ filtered().length }}</strong>
                @if (filtered().length !== total()) { <span class="muted">{{ 'reports.ofTotal' | transloco: { total: total() } }}</span> }
                {{ (filtered().length === 1 ? 'reports.recordOne' : 'reports.recordMany') | transloco }}
              </span>
              @if (activeFilters() > 0) {
                <span class="hint-inline">
                  <mat-icon>filter_alt</mat-icon>
                  {{ 'reports.filterHint' | transloco }}
                </span>
              }
              @if (demo()) {
                <span class="demo-badge" [title]="'reports.demoTooltip' | transloco">
                  <mat-icon>science</mat-icon> {{ 'reports.demo' | transloco }}
                </span>
              }
            </div>

            @if (loading()) { <mat-progress-bar mode="indeterminate" class="loader-bar" /> }

            <!-- Estados: carga (skeleton), error, vacío, o tabla -->
            @if (loading()) {
              <div class="skeleton">
                @for (r of skeletonRows; track r) {
                  <div class="skeleton-row"></div>
                }
              </div>
            } @else if (error()) {
              <div class="error-block">
                <mat-icon>cloud_off</mat-icon>
                <p>{{ error() }}</p>
                <button mat-flat-button color="primary" (click)="reload()">
                  <mat-icon>refresh</mat-icon> {{ 'common.retry' | transloco }}
                </button>
              </div>
            } @else if (filtered().length === 0) {
              <app-empty-state
                icon="search_off"
                [message]="(total() === 0 ? 'reports.emptyPeriod' : 'reports.emptyFilters') | transloco"
              />
            } @else {
              <app-report-table [rows]="paged()" [sort]="sort()" [filters]="filtersForm" (sortChange)="onSort($event)" />
              <mat-paginator
                [length]="filtered().length"
                [pageSize]="pageSize()"
                [pageIndex]="pageIndex()"
                [pageSizeOptions]="[25, 50, 100]"
                (page)="onPage($event)"
              />
            }
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
  styles: [
    `
      .toolbar {
        display: flex;
        gap: var(--sp-3);
        align-items: flex-start;
        flex-wrap: wrap;
        margin-bottom: var(--sp-2);
      }
      .toolbar .search { flex: 1 1 320px; }
      .dates { display: flex; gap: var(--sp-2); }
      .date { width: 160px; }
      .toolbar-actions { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
      .spacer { flex: 1 1 auto; }

      .indicators {
        display: flex;
        align-items: center;
        gap: var(--sp-4);
        margin: var(--sp-2) 0 var(--sp-3);
        flex-wrap: wrap;
      }
      .count { font-size: 0.9rem; }
      .count strong { font-size: 1.05rem; color: var(--brand); }
      .hint-inline {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8rem;
        color: var(--text-soft);
      }
      .hint-inline mat-icon { font-size: 16px; width: 16px; height: 16px; }
      .demo-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8rem;
        font-weight: 600;
        padding: 3px 10px;
        border-radius: 999px;
        color: var(--warning);
        background: var(--warning-bg);
      }
      .demo-badge mat-icon { font-size: 16px; width: 16px; height: 16px; }
      .filter-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        margin-left: 6px;
        border-radius: 999px;
        background: var(--brand);
        color: #fff;
        font-size: 0.7rem;
        font-weight: 700;
      }
      .loader-bar { margin: var(--sp-2) 0; }

      .skeleton { display: flex; flex-direction: column; gap: 10px; padding: var(--sp-4) 0; }
      .skeleton-row {
        height: 40px;
        border-radius: var(--radius-sm);
        background: linear-gradient(90deg, var(--surface-2) 25%, var(--border) 37%, var(--surface-2) 63%);
        background-size: 400% 100%;
        animation: shimmer 1.4s ease infinite;
      }
      @keyframes shimmer {
        0% { background-position: 100% 50%; }
        100% { background-position: 0 50%; }
      }

      .error-block {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--sp-3);
        padding: 48px 16px;
        color: var(--text-muted);
        text-align: center;
      }
      .error-block mat-icon { font-size: 44px; width: 44px; height: 44px; opacity: 0.6; }
      .error-block p { margin: 0; max-width: 420px; }

      mat-paginator { background: transparent; margin-top: var(--sp-2); }
    `,
  ],
})
export class ReportsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ReportService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);

  protected readonly skeletonRows = Array.from({ length: 8 }, (_, i) => i);

  /** FormGroup con todo el estado de filtros (fuente de verdad, persiste mientras viva el componente). */
  protected readonly form: FormGroup = this.buildForm();
  /** Mismo FormGroup, pasado a la tabla para los embudos de encabezado. */
  protected readonly filtersForm = this.form;

  // --- Estado de datos ---
  private readonly rawRows = signal<AttendanceReport[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly demo = signal(false);

  // --- Ordenamiento y paginación (cliente) ---
  protected readonly sort = signal<SortState>({ column: 'employeeName', direction: 'asc' });
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(25);

  /** Valor reactivo del formulario (para alimentar los pipelines de filtrado). */
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly total = computed(() => this.rawRows().length);
  protected readonly activeFilters = computed(() => countActiveFilters(this.formValue() as ReportFilters));

  /** Filas tras aplicar búsqueda + filtros combinables. */
  protected readonly filtered = computed(() => {
    const f = this.formValue() as ReportFilters;
    return this.rawRows().filter((row) => this.matches(row, f));
  });

  /** Filas filtradas y ordenadas. */
  protected readonly sorted = computed(() => {
    const s = this.sort();
    const rows = [...this.filtered()];
    rows.sort((a, b) => this.compare(a, b, s));
    return rows;
  });

  /** Página actual del conjunto ordenado (clamp defensivo si el filtro redujo el total). */
  protected readonly paged = computed(() => {
    const size = this.pageSize();
    const rows = this.sorted();
    let start = this.pageIndex() * size;
    if (start >= rows.length) {
      start = 0;
    }
    return rows.slice(start, start + size);
  });

  constructor() {
    // Recarga desde el backend cuando cambia el rango de fechas (debounced).
    const from$ = this.form.get('from')!.valueChanges;
    const to$ = this.form.get('to')!.valueChanges;
    from$.pipe(debounceTime(400), distinctUntilChanged(), takeUntilDestroyed()).subscribe(() => this.reload());
    to$.pipe(debounceTime(400), distinctUntilChanged(), takeUntilDestroyed()).subscribe(() => this.reload());

    // Vuelve a la primera página cuando cambian los filtros (evita quedar en una página vacía).
    this.form.valueChanges.pipe(debounceTime(150), takeUntilDestroyed()).subscribe(() => this.pageIndex.set(0));

    this.reload();
  }

  /** (Re)carga el reporte para el rango de fechas actual. */
  protected reload(): void {
    const { from, to } = this.form.getRawValue() as ReportFilters;
    this.loading.set(true);
    this.error.set(null);
    this.service.summary(from, to).subscribe({
      next: (rows) => {
        this.rawRows.set(rows);
        this.demo.set(false);
        this.loading.set(false);
      },
      error: () => {
        // Modo demostración: sin backend, se usan datos mock para poder evaluar la pantalla.
        this.rawRows.set(generateMockReport());
        this.demo.set(true);
        this.loading.set(false);
        this.notify.error(this.transloco.translate('reports.loadErrorDemo'));
      },
    });
  }

  protected onSort(column: SortColumn): void {
    const current = this.sort();
    if (current.column === column) {
      this.sort.set({ column, direction: current.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      this.sort.set({ column, direction: 'asc' });
    }
  }

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  /** Limpia búsqueda y filtros por columna, conservando el rango de fechas seleccionado. */
  protected clearFilters(): void {
    const defaults = defaultFilters();
    const current = this.form.getRawValue() as ReportFilters;
    this.form.reset({ ...defaults, from: current.from, to: current.to }, { emitEvent: true });
    this.pageIndex.set(0);
  }

  protected export(kind: 'excel' | 'pdf'): void {
    const rows = this.sorted();
    if (rows.length === 0) {
      return;
    }
    const { from, to } = this.form.getRawValue() as ReportFilters;
    if (kind === 'excel') {
      exportToExcel(rows);
    } else {
      exportToPdf(rows, { from, to });
    }
  }

  // --- Lógica de filtrado / orden ---

  private matches(row: AttendanceReport, f: ReportFilters): boolean {
    const search = f.search.trim().toLowerCase();
    if (search) {
      const haystack = `${row.employeeNumber} ${row.employeeName} ${row.workCenter}`.toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    if (!this.textMatch(row.employeeNumber, f.employeeNumber)) return false;
    if (!this.textMatch(row.employeeName, f.employeeName)) return false;
    if (!this.textMatch(row.workCenter, f.workCenter)) return false;

    if (f.status === 'ACTIVE' && !row.active) return false;
    if (f.status === 'INACTIVE' && row.active) return false;

    for (const col of NUMERIC_COLUMNS) {
      const range = f.ranges[col];
      const value = row[col];
      if (range.min !== null && range.min !== undefined && value < range.min) return false;
      if (range.max !== null && range.max !== undefined && value > range.max) return false;
    }
    return true;
  }

  private textMatch(value: string, filter: string): boolean {
    const q = filter?.trim().toLowerCase();
    return !q || value.toLowerCase().includes(q);
  }

  private compare(a: AttendanceReport, b: AttendanceReport, s: SortState): number {
    const dir = s.direction === 'asc' ? 1 : -1;
    const av = a[s.column];
    const bv = b[s.column];
    if (typeof av === 'number' && typeof bv === 'number') {
      return (av - bv) * dir;
    }
    return String(av).localeCompare(String(bv), 'es', { numeric: true }) * dir;
  }

  private buildForm(): FormGroup {
    const d = defaultFilters();
    const rangeGroup = (): FormGroup =>
      this.fb.group({ min: this.fb.control<number | null>(null), max: this.fb.control<number | null>(null) });

    return this.fb.group({
      from: this.fb.nonNullable.control(d.from),
      to: this.fb.nonNullable.control(d.to),
      search: this.fb.nonNullable.control(d.search),
      employeeNumber: this.fb.nonNullable.control(d.employeeNumber),
      employeeName: this.fb.nonNullable.control(d.employeeName),
      workCenter: this.fb.nonNullable.control(d.workCenter),
      status: this.fb.nonNullable.control(d.status),
      ranges: this.fb.group({
        expectedDays: rangeGroup(),
        attendedDays: rangeGroup(),
        justifiedAbsences: rangeGroup(),
        unjustifiedAbsences: rangeGroup(),
        lateArrivals: rangeGroup(),
        workedHours: rangeGroup(),
        overtimeHours: rangeGroup(),
        totalHours: rangeGroup(),
        compliancePercentage: rangeGroup(),
      }),
    });
  }
}
