import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { TranslocoPipe } from '@jsverse/transloco';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { AppNumberPipe } from '../../core/i18n/app-number.pipe';
import { PAGE_SIZE_OPTIONS, SEARCH_DEBOUNCE_MS, pageSizePreference } from '../../core/ui/catalog';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../core/ui/loading-bar.component';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { exportToCsv, exportToExcel, exportToPdf } from './report-export.util';
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

type ExportKind = 'excel' | 'pdf' | 'csv';

const NUMERIC_COLUMNS: readonly NumericColumn[] = [
  'expectedDays', 'attendedDays', 'justifiedAbsences', 'unjustifiedAbsences',
  'lateArrivals', 'workedHours', 'overtimeHours', 'totalHours', 'compliancePercentage',
];

/**
 * P16 · Reporte de asistencia por colaborador (RF-11). El rango Desde/Hasta recarga del servidor
 * (espera de 400 ms); la búsqueda, la fila de filtros por columna, el orden (nombre ascendente) y la
 * paginación se aplican sobre lo cargado. «Exportar» (Excel · PDF · CSV) respeta los filtros.
 */
@Component({
  selector: 'app-reports',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    TranslocoPipe,
    AppNumberPipe,
    EmptyStateComponent,
    LoadingBarComponent,
    PageHeaderComponent,
    ReportTableComponent,
  ],
  styles: [
    `
      p { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      .exportar .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
    `,
  ],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'reports.title' | transloco" />

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
        <button mat-stroked-button type="button" (click)="reload()">{{ 'common.retry' | transloco }}</button>
      </app-empty-state>
    } @else {
      <section class="nx-panel nx-panel--listado">
        <div class="nx-filtros nx-filtros--reporte" [formGroup]="form">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-buscador">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>{{ 'reports.search' | transloco }}</mat-label>
            <input matInput type="search" formControlName="search" autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-campo--fecha">
            <mat-label>{{ 'period.from' | transloco }}</mat-label>
            <input matInput type="date" formControlName="from" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-campo--fecha">
            <mat-label>{{ 'period.to' | transloco }}</mat-label>
            <input matInput type="date" formControlName="to" />
          </mat-form-field>

          <div class="nx-filtros__acciones">
            <button mat-button type="button" (click)="clearFilters()" [disabled]="activeFilters() === 0">
              <mat-icon>filter_alt_off</mat-icon>
              {{ 'common.clearFilters' | transloco }}
              @if (activeFilters() > 0) { <span class="nx-text-numeric">({{ activeFilters() }})</span> }
            </button>
            <button
              mat-flat-button
              type="button"
              class="exportar"
              [matMenuTriggerFor]="formatos"
              [disabled]="filtered().length === 0 || exporting()"
              [attr.aria-busy]="exporting()"
            >
              @if (exporting()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>download</mat-icon> }
              {{ 'common.export' | transloco }}
              <mat-icon iconPositionEnd>expand_more</mat-icon>
            </button>
            <mat-menu #formatos="matMenu" xPosition="before" [attr.aria-label]="'reports.exportFormat' | transloco">
              <button mat-menu-item type="button" (click)="export('excel')"><mat-icon>download</mat-icon><span>Excel</span></button>
              <button mat-menu-item type="button" (click)="export('pdf')"><mat-icon>download</mat-icon><span>PDF</span></button>
              <button mat-menu-item type="button" (click)="export('csv')"><mat-icon>download</mat-icon><span>CSV</span></button>
            </mat-menu>
          </div>
        </div>

        @if (!loading() && total() === 0) {
          <app-empty-state icon="bar_chart" [message]="'reports.emptyPeriod' | transloco" />
        } @else {
          <p class="nx-contador">
            <b class="nx-text-numeric">{{ filtered().length | appNumber }}</b>
            {{ (filtered().length === 1 ? 'reports.recordOne' : 'reports.recordMany') | transloco }}
          </p>
          @if (!loading() && filtered().length === 0) {
            <app-empty-state icon="search" [message]="'reports.emptyFilters' | transloco">
              <button mat-button type="button" (click)="clearFilters()">{{ 'common.clearFilters' | transloco }}</button>
            </app-empty-state>
          }
          <!-- La tabla se queda aunque no haya filas: su fila de filtros es la que se está usando. -->
          <app-report-table [rows]="paged()" [sort]="sort()" [filters]="form" (sortChange)="onSort($event)" />
          <mat-paginator
            [length]="filtered().length"
            [pageSize]="pageSize()"
            [pageIndex]="pageIndex()"
            [pageSizeOptions]="pageSizeOptions"
            (page)="onPage($event)"
          />
        }
      </section>
    }
  `,
})
export class ReportsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ReportService);

  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  /** FormGroup con todo el estado de filtros; la tabla lo usa para su fila de filtros. */
  protected readonly form: FormGroup = this.buildForm();

  // --- Estado de datos ---
  private readonly rawRows = signal<AttendanceReport[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly exporting = signal(false);

  // --- Ordenamiento y paginación (cliente) ---
  protected readonly sort = signal<SortState>({ column: 'employeeName', direction: 'asc' });
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = pageSizePreference('reports');

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
    // Recarga desde el backend cuando cambia el rango de fechas.
    const from$ = this.form.get('from')!.valueChanges;
    const to$ = this.form.get('to')!.valueChanges;
    from$.pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed()).subscribe(() => this.reload());
    to$.pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed()).subscribe(() => this.reload());

    // Vuelve a la primera página cuando cambian los filtros (evita quedar en una página vacía).
    this.form.valueChanges.pipe(debounceTime(150), takeUntilDestroyed()).subscribe(() => this.pageIndex.set(0));

    this.reload();
  }

  /** (Re)carga el reporte para el rango de fechas actual. */
  protected reload(): void {
    const { from, to } = this.form.getRawValue() as ReportFilters;
    this.loading.set(true);
    this.error.set(false);
    this.service.summary(from, to).subscribe({
      next: (rows) => {
        this.rawRows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
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

  protected export(kind: ExportKind): void {
    const rows = this.sorted();
    if (rows.length === 0) {
      return;
    }
    const { from, to } = this.form.getRawValue() as ReportFilters;
    this.exporting.set(true);
    // Un tick para que el botón pinte su estado de carga antes de generar el archivo.
    setTimeout(() => {
      try {
        if (kind === 'excel') exportToExcel(rows);
        else if (kind === 'pdf') exportToPdf(rows, { from, to });
        else exportToCsv(rows);
      } finally {
        this.exporting.set(false);
      }
    });
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
