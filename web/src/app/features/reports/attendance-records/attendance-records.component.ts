import { DatePipe } from '@angular/common';
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
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { AttendanceEventType } from '../../admin/event-types/event-type.models';
import { EventTypesService } from '../../admin/event-types/event-types.service';
import {
  AttendanceRecordReport,
  AttendanceRecordStatus,
  DEFAULT_EVENT_TYPE_LABELS,
  RecordSortColumn,
  RecordSortState,
  STATUS_TONES,
} from './attendance-records.models';
import { AttendanceRecordsService } from './attendance-records.service';
import { recordStatusLabel, rejectionLabel } from '../../attendance-events/attendance-events.models';

interface ColumnDef {
  key: RecordSortColumn;
  /** Clave de traducción del encabezado. */
  label: string;
}

const COLUMNS: readonly ColumnDef[] = [
  { key: 'employeeNumber', label: 'reports.field.employeeNumber' },
  { key: 'employeeName', label: 'common.name' },
  { key: 'serverTime', label: 'attendanceEvents.col.date' },
  { key: 'eventType', label: 'records.eventType' },
  { key: 'status', label: 'common.status' },
  { key: 'workCenter', label: 'attendanceEvents.col.site' },
];

const STATUS_OPTIONS: readonly AttendanceRecordStatus[] = ['ACCEPTED', 'REJECTED', 'PENDING_REVIEW'];

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Reporte de registros individuales de asistencia por empleado (RF-11). Muestra una fila por
 * marcación (número + nombre de empleado, fecha y hora, tipo de evento, estado y centro de trabajo),
 * sin exponer ids. Carga el rango de fechas del backend y aplica búsqueda, filtros (estado y tipo de
 * evento), ordenamiento y paginación en el cliente.
 */
@Component({
  selector: 'app-attendance-records',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatPaginatorModule,
    PageHeaderComponent,
    EmptyStateComponent,
    TranslocoPipe,
  ],
  template: `
    <app-page-header [title]="'records.title' | transloco" [subtitle]="'records.subtitle' | transloco" />

    <mat-card>
      <mat-card-content>
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

          <mat-form-field appearance="outline" class="filter">
            <mat-label>{{ 'common.status' | transloco }}</mat-label>
            <mat-select formControlName="status">
              <mat-option value="ALL">{{ 'common.all' | transloco }}</mat-option>
              @for (s of statusOptions; track s) {
                <mat-option [value]="s">{{ statusLabel(s) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="filter">
            <mat-label>{{ 'records.eventType' | transloco }}</mat-label>
            <mat-select formControlName="eventType">
              <mat-option value="ALL">{{ 'common.all' | transloco }}</mat-option>
              @for (t of eventTypeOptions; track t) {
                <mat-option [value]="t">{{ eventLabel(t) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>

        <div class="indicators">
          <span class="count">
            <strong>{{ filtered().length }}</strong>
            @if (filtered().length !== total()) { <span class="muted">{{ 'reports.ofTotal' | transloco: { total: total() } }}</span> }
            {{ (filtered().length === 1 ? 'reports.recordOne' : 'reports.recordMany') | transloco }}
          </span>
        </div>

        @if (loading()) { <mat-progress-bar mode="indeterminate" class="loader-bar" /> }

        @if (loading()) {
          <div class="skeleton">
            @for (r of skeletonRows; track r) { <div class="skeleton-row"></div> }
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
            [message]="(total() === 0 ? 'records.emptyPeriod' : 'records.emptyFilters') | transloco"
          />
        } @else {
          <div class="table-wrap">
            <table class="records-table">
              <thead>
                <tr>
                  @for (col of columns; track col.key) {
                    <th [class.sorted]="sort().column === col.key" (click)="onSort(col.key)">
                      <span class="th-content">
                        {{ col.label | transloco }}
                        <mat-icon class="sort-icon">{{ sortIcon(col.key) }}</mat-icon>
                      </span>
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of paged(); track $index) {
                  <tr>
                    <td class="mono">{{ row.employeeNumber }}</td>
                    <td>{{ row.employeeName }}</td>
                    <td class="mono">{{ row.serverTime | date: 'yyyy-MM-dd HH:mm:ss' }}</td>
                    <td>{{ eventLabel(row.eventType) }}</td>
                    <td>
                      <span
                        class="status-chip"
                        [class]="statusTone(row.status)"
                        [matTooltip]="rejectionTooltip(row)"
                        [matTooltipDisabled]="!rejectionTooltip(row)"
                      >
                        {{ statusLabel(row.status) }}
                      </span>
                    </td>
                    <td>{{ row.workCenter }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
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
  `,
  styles: [
    `
      .toolbar {
        display: flex;
        gap: var(--nx-space-3);
        align-items: flex-start;
        flex-wrap: wrap;
        margin-bottom: var(--nx-space-2);
      }
      .toolbar .search { flex: 1 1 320px; }
      .dates { display: flex; gap: var(--nx-space-2); }
      .date { width: 160px; }
      .filter { width: 180px; }

      .indicators { margin: var(--nx-space-2) 0 var(--nx-space-3); }
      .count { font-size: 0.9rem; }
      .count strong { font-size: 1.05rem; color: var(--nx-color-action-primary); }
      .loader-bar { margin: var(--nx-space-2) 0; }

      .records-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        font-size: 0.85rem;
        min-width: 820px;
      }
      thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: var(--nx-color-surface-subtle);
        color: var(--nx-color-text-secondary);
        font-size: 0.72rem;
        font-weight: var(--nx-font-weight-semibold);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        text-align: left;
        padding: var(--nx-space-3) var(--nx-space-3);
        border-bottom: 1px solid var(--nx-color-border-default);
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
        transition: color 0.12s var(--nx-motion-easing-standard);
      }
      thead th:hover { color: var(--nx-color-text-primary); }
      thead th.sorted { color: var(--nx-color-action-primary); }
      .th-content { display: inline-flex; align-items: center; gap: 2px; }
      .sort-icon { font-size: 16px; width: 16px; height: 16px; opacity: 0.7; }
      tbody td {
        padding: var(--nx-space-3) var(--nx-space-3);
        border-bottom: 1px solid var(--nx-color-border-default);
        color: var(--nx-color-text-primary);
        white-space: nowrap;
      }
      tbody td.mono { font-variant-numeric: tabular-nums; color: var(--nx-color-text-secondary); }
      tbody tr { transition: background 0.12s var(--nx-motion-easing-standard); animation: fade-in 0.18s var(--nx-motion-easing-standard); }
      tbody tr:nth-child(even) { background: color-mix(in srgb, var(--nx-color-surface-subtle) 55%, transparent); }
      tbody tr:hover { background: var(--nx-color-surface-subtle); }

      .error-block {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nx-space-3);
        padding: 48px 16px;
        color: var(--nx-color-text-secondary);
        text-align: center;
      }
      .error-block mat-icon { font-size: 44px; width: 44px; height: 44px; opacity: 0.6; }
      .error-block p { margin: 0; max-width: 420px; }

      .skeleton { display: flex; flex-direction: column; gap: 10px; padding: var(--nx-space-4) 0; }
      .skeleton-row {
        height: 40px;
        border-radius: var(--nx-radius-sm);
        background: linear-gradient(90deg, var(--nx-color-surface-subtle) 25%, var(--nx-color-border-default) 37%, var(--nx-color-surface-subtle) 63%);
        background-size: 400% 100%;
        animation: shimmer 1.4s var(--nx-motion-easing-standard) infinite;
      }
      @keyframes shimmer {
        0% { background-position: 100% 50%; }
        100% { background-position: 0 50%; }
      }
      @keyframes fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      mat-paginator { background: transparent; margin-top: var(--nx-space-2); }
    `,
  ],
})
export class AttendanceRecordsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(AttendanceRecordsService);
  private readonly eventTypes = inject(EventTypesService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);

  protected readonly skeletonRows = Array.from({ length: 8 }, (_, i) => i);
  protected readonly columns = COLUMNS;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly eventTypeOptions = Object.keys(DEFAULT_EVENT_TYPE_LABELS) as AttendanceEventType[];

  protected readonly form: FormGroup = this.buildForm();

  private readonly rawRows = signal<AttendanceRecordReport[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Etiquetas de tipo de evento personalizadas por la empresa; las predeterminadas se traducen. */
  private readonly eventLabels = signal<Record<string, string>>({});

  protected readonly sort = signal<RecordSortState>({ column: 'serverTime', direction: 'desc' });
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(25);

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly total = computed(() => this.rawRows().length);

  protected readonly filtered = computed(() => {
    const f = this.formValue() as Record<string, string>;
    const search = (f['search'] ?? '').trim().toLowerCase();
    return this.rawRows().filter((row) => {
      if (f['status'] !== 'ALL' && row.status !== f['status']) return false;
      if (f['eventType'] !== 'ALL' && row.eventType !== f['eventType']) return false;
      if (search) {
        const haystack = `${row.employeeNumber} ${row.employeeName} ${row.workCenter}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  });

  protected readonly sorted = computed(() => {
    const s = this.sort();
    const rows = [...this.filtered()];
    const dir = s.direction === 'asc' ? 1 : -1;
    rows.sort((a, b) => String(a[s.column]).localeCompare(String(b[s.column]), 'es', { numeric: true }) * dir);
    return rows;
  });

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
    const from$ = this.form.get('from')!.valueChanges;
    const to$ = this.form.get('to')!.valueChanges;
    from$.pipe(debounceTime(400), distinctUntilChanged(), takeUntilDestroyed()).subscribe(() => this.reload());
    to$.pipe(debounceTime(400), distinctUntilChanged(), takeUntilDestroyed()).subscribe(() => this.reload());
    this.form.valueChanges.pipe(debounceTime(150), takeUntilDestroyed()).subscribe(() => this.pageIndex.set(0));

    this.loadEventTypeLabels();
    this.reload();
  }

  protected reload(): void {
    const { from, to } = this.form.getRawValue() as { from: string; to: string };
    this.loading.set(true);
    this.error.set(null);
    this.service.records(from, to).subscribe({
      next: (rows) => {
        this.rawRows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.rawRows.set([]);
        this.error.set(this.transloco.translate('records.loadError'));
        this.loading.set(false);
        this.notify.error(this.transloco.translate('records.loadError'));
      },
    });
  }

  /** Traduce un código de tipo de evento a su etiqueta (empresa o respaldo). */
  protected eventLabel(code: string): string {
    return this.eventLabels()[code] ?? this.transloco.translate(`records.event.${code}`);
  }

  protected statusLabel(status: AttendanceRecordStatus): string {
    return recordStatusLabel(status);
  }

  protected statusTone(status: AttendanceRecordStatus): string {
    return STATUS_TONES[status];
  }

  protected rejectionTooltip(row: AttendanceRecordReport): string {
    if (!row.rejectionReason) {
      return '';
    }
    return rejectionLabel(row.rejectionReason);
  }

  protected onSort(column: RecordSortColumn): void {
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

  protected sortIcon(column: RecordSortColumn): string {
    if (this.sort().column !== column) {
      return 'unfold_more';
    }
    return this.sort().direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  /** Carga las etiquetas configuradas por la empresa; si falla, conserva las de respaldo. */
  private loadEventTypeLabels(): void {
    this.eventTypes.list().subscribe({
      next: (settings) => {
        const map: Record<string, string> = {};
        for (const s of settings) {
          // La etiqueta sembrada por defecto no cuenta como personalizada: se muestra traducida.
          if (s.label?.trim() && s.label.trim() !== DEFAULT_EVENT_TYPE_LABELS[s.eventType]) {
            map[s.eventType] = s.label;
          }
        }
        this.eventLabels.set(map);
      },
      error: () => void 0,
    });
  }

  private buildForm(): FormGroup {
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return this.fb.group({
      from: this.fb.nonNullable.control(isoDay(from)),
      to: this.fb.nonNullable.control(isoDay(today)),
      search: this.fb.nonNullable.control(''),
      status: this.fb.nonNullable.control('ALL'),
      eventType: this.fb.nonNullable.control('ALL'),
    });
  }
}
