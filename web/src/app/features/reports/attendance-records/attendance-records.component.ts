import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { AppDatePipe } from '../../../core/i18n/app-date.pipe';
import { AppNumberPipe } from '../../../core/i18n/app-number.pipe';
import { PAGE_SIZE_OPTIONS, SEARCH_DEBOUNCE_MS, pageSizePreference } from '../../../core/ui/catalog';
import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { FiltersButtonComponent } from '../../../core/ui/filters-button.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { ScrollDirective } from '../../../core/ui/scroll.directive';
import { StatusChipComponent } from '../../../core/ui/status-chip.component';
import { AttendanceEventType } from '../../admin/event-types/event-type.models';
import { EventTypesService } from '../../admin/event-types/event-types.service';
import {
  AttendanceRecordReport,
  AttendanceRecordStatus,
  DEFAULT_EVENT_TYPE_LABELS,
  RecordSortColumn,
  RecordSortState,
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
 * P40 · Registros de asistencia (RF-11): una fila por marcación (número y nombre, fecha y hora,
 * tipo de evento, estado y centro), sin exponer ids. El rango Desde/Hasta recarga del backend con
 * espera de 400 ms; búsqueda, estado, tipo de evento, orden (fecha y hora descendente) y paginación
 * se aplican sobre lo cargado. El chip de estado muestra el motivo de rechazo.
 */
@Component({
  selector: 'app-attendance-records',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatPaginatorModule,
    TranslocoPipe,
    AppDatePipe,
    AppNumberPipe,
    EmptyStateComponent,
    FiltersButtonComponent,
    LoadingBarComponent,
    PageHeaderComponent,
    ScrollDirective,
    StatusChipComponent,
  ],
  styles: [
    `
      p { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      .orden { padding: var(--nx-space-0); border: 0; background: transparent; font: inherit; letter-spacing: inherit; text-transform: inherit; color: inherit; cursor: pointer; }
      .orden mat-icon { width: var(--nx-icon-size-sm); height: var(--nx-icon-size-sm); font-size: var(--nx-icon-size-sm); }
      th[aria-sort] .orden { color: var(--nx-color-action-primary); }
      td { white-space: nowrap; }
    `,
  ],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'records.title' | transloco" />

    <ng-template #secundarios>
      <ng-container [formGroup]="form">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'common.status' | transloco }}</mat-label>
          <mat-select formControlName="status">
            <mat-option value="ALL">{{ 'common.all' | transloco }}</mat-option>
            @for (s of statusOptions; track s) { <mat-option [value]="s">{{ statusLabel(s) }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'records.eventType' | transloco }}</mat-label>
          <mat-select formControlName="eventType">
            <mat-option value="ALL">{{ 'common.all' | transloco }}</mat-option>
            @for (t of eventTypeOptions; track t) { <mat-option [value]="t">{{ eventLabel(t) }}</mat-option> }
          </mat-select>
        </mat-form-field>
      </ng-container>
    </ng-template>

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
          <div class="nx-flt-sec nx-flt-sec--grupo"><ng-container [ngTemplateOutlet]="secundarios" /></div>
          <app-filters-button [filters]="secundarios" />
        </div>

        @if (!loading() && total() === 0) {
          <app-empty-state icon="history" [message]="'records.emptyPeriod' | transloco" />
        } @else if (!loading() && filtered().length === 0) {
          <app-empty-state icon="search" [message]="'records.emptyFilters' | transloco">
            <button mat-button type="button" (click)="clearFilters()">{{ 'common.clearFilters' | transloco }}</button>
          </app-empty-state>
        } @else {
          <p class="nx-contador">
            <b class="nx-text-numeric">{{ filtered().length | appNumber }}</b>
            {{ (filtered().length === 1 ? 'reports.recordOne' : 'reports.recordMany') | transloco }}
          </p>
          <div class="nx-tabla">
            <div class="nx-tabla__scroll nx-scroll" nxScroll>
              <table>
                <thead>
                  <tr>
                    @for (col of columns; track col.key) {
                      <th scope="col" [attr.aria-sort]="ariaSort(col.key)">
                        <button type="button" class="nx-th orden" (click)="onSort(col.key)">
                          {{ col.label | transloco }}
                          <mat-icon class="nx-orden" [class.is-on]="sort().column === col.key" aria-hidden="true">{{ sortIcon(col.key) }}</mat-icon>
                        </button>
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of paged(); track $index) {
                    <tr>
                      <td class="nx-text-code">{{ row.employeeNumber }}</td>
                      <td><span class="nx-trunc">{{ row.employeeName }}</span></td>
                      <td class="nx-text-numeric">{{ row.serverTime | appDate: 'dd/MM/yyyy HH:mm:ss' }}</td>
                      <td>{{ eventLabel(row.eventType) }}</td>
                      <td>
                        <app-status-chip [status]="row.status" [label]="statusLabel(row.status)"
                          [matTooltip]="rejectionTooltip(row)" [matTooltipDisabled]="!rejectionTooltip(row)" />
                      </td>
                      <td><span class="nx-trunc">{{ row.workCenter }}</span></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
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
export class AttendanceRecordsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(AttendanceRecordsService);
  private readonly eventTypes = inject(EventTypesService);
  private readonly transloco = inject(TranslocoService);

  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly columns = COLUMNS;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly eventTypeOptions = Object.keys(DEFAULT_EVENT_TYPE_LABELS) as AttendanceEventType[];

  protected readonly form: FormGroup = this.buildForm();

  private readonly rawRows = signal<AttendanceRecordReport[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);

  /** Etiquetas de tipo de evento personalizadas por la empresa; las predeterminadas se traducen. */
  private readonly eventLabels = signal<Record<string, string>>({});

  protected readonly sort = signal<RecordSortState>({ column: 'serverTime', direction: 'desc' });
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = pageSizePreference('attendance-records');

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
    from$.pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed()).subscribe(() => this.reload());
    to$.pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed()).subscribe(() => this.reload());
    this.form.valueChanges.pipe(debounceTime(150), takeUntilDestroyed()).subscribe(() => this.pageIndex.set(0));

    this.loadEventTypeLabels();
    this.reload();
  }

  protected reload(): void {
    const { from, to } = this.form.getRawValue() as { from: string; to: string };
    this.loading.set(true);
    this.error.set(false);
    this.service.records(from, to).subscribe({
      next: (rows) => {
        this.rawRows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.rawRows.set([]);
        this.error.set(true);
        this.loading.set(false);
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

  /** Limpia búsqueda, estado y tipo de evento, conservando el rango de fechas. */
  protected clearFilters(): void {
    this.form.patchValue({ search: '', status: 'ALL', eventType: 'ALL' });
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

  protected ariaSort(column: RecordSortColumn): 'ascending' | 'descending' | null {
    if (this.sort().column !== column) return null;
    return this.sort().direction === 'asc' ? 'ascending' : 'descending';
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
