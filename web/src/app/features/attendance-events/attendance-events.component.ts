import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subject, debounceTime } from 'rxjs';
import * as XLSX from 'xlsx';

import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { AppNumberPipe } from '../../core/i18n/app-number.pipe';
import { PAGE_SIZE_OPTIONS, SEARCH_DEBOUNCE_MS, pageSizePreference } from '../../core/ui/catalog';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../core/ui/loading-bar.component';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { ScrollDirective } from '../../core/ui/scroll.directive';
import { StatusChipComponent } from '../../core/ui/status-chip.component';
import { AttendanceDetailDialogComponent } from './attendance-detail-dialog.component';
import { AttendanceEvent, EVENT_CODES, eventLabel, recordStatusLabel, rejectionLabel } from './attendance-events.models';
import { AttendanceEventsService } from './attendance-events.service';

type Period = 'week' | 'fortnight' | 'month' | 'range';
type FilterKey = 'date' | 'user' | 'event' | 'site' | 'status';

const PERIODS: readonly Period[] = ['week', 'fortnight', 'month', 'range'];
const STATUS_CODES = ['ACCEPTED', 'REJECTED', 'PENDING_REVIEW'] as const;
const DATE_TIME = 'dd/MM/yyyy HH:mm:ss';

/**
 * P39 · Entradas y salidas (RF-11): cada registro con fecha y hora, colaborador, evento, centro,
 * estado y si tiene foto. «Periodo» (semana · quincena · mes · rango) y Desde/Hasta recargan del
 * servidor con espera de 400 ms; la fila de filtros, el orden (fecha y hora descendente) y la
 * paginación se aplican sobre lo cargado. La fila abre P41. Requiere {@code report:export}.
 */
@Component({
  selector: 'app-attendance-events',
  standalone: true,
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    MatTooltipModule,
    TranslocoPipe,
    AppDatePipe,
    AppNumberPipe,
    EmptyStateComponent,
    LoadingBarComponent,
    PageHeaderComponent,
    ScrollDirective,
    StatusChipComponent,
  ],
  styles: [
    `
      p { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      .exportar .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
      .nx-fila-filtros th { padding-block: var(--nx-space-1); }
      input.nx-mini, select.nx-mini { width: 100%; background-color: var(--nx-color-surface-default); font-family: inherit; text-transform: none; letter-spacing: var(--nx-font-tracking-normal); }
      input.nx-mini::placeholder { color: var(--nx-color-text-placeholder); }
      .nx-fila-link { padding: var(--nx-space-0); border: 0; background: transparent; font: inherit; color: var(--nx-color-action-primary); cursor: pointer; text-align: left; }
      tbody tr { cursor: pointer; }
      td { white-space: nowrap; }
      .foto { color: var(--nx-color-action-primary); }
    `,
  ],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'layout.nav.attendanceEvents' | transloco" />

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
        <button mat-stroked-button type="button" (click)="reload()">{{ 'common.retry' | transloco }}</button>
      </app-empty-state>
    } @else {
      <section class="nx-panel nx-panel--listado">
        <div class="nx-filtros nx-filtros--reporte nx-filtros--periodo">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-campo--fecha2">
            <mat-label>{{ 'period.label' | transloco }}</mat-label>
            <mat-select [value]="period()" (selectionChange)="setPeriod($event.value)">
              @for (p of periods; track p) { <mat-option [value]="p">{{ 'period.' + p | transloco }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-campo--fecha">
            <mat-label>{{ 'period.from' | transloco }}</mat-label>
            <input matInput type="date" [value]="from()" (change)="onDate('from', $event)" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-campo--fecha">
            <mat-label>{{ 'period.to' | transloco }}</mat-label>
            <input matInput type="date" [value]="to()" (change)="onDate('to', $event)" />
          </mat-form-field>

          <div class="nx-filtros__acciones">
            @if (activeFilters() > 0) {
              <button mat-button type="button" (click)="clearFilters()">
                <mat-icon>filter_alt_off</mat-icon>{{ 'common.clear' | transloco }}
                <span class="nx-text-numeric">({{ activeFilters() }})</span>
              </button>
            }
            <button mat-flat-button type="button" class="exportar" (click)="exportExcel()"
                    [disabled]="filtered().length === 0 || exporting()" [attr.aria-busy]="exporting()">
              @if (exporting()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>download</mat-icon> }
              {{ 'people.exportExcel' | transloco }}
            </button>
          </div>
        </div>

        @if (!loading() && events().length === 0) {
          <app-empty-state icon="history" [message]="'attendanceEvents.empty' | transloco" />
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
                    <th scope="col">{{ 'attendanceEvents.col.date' | transloco }}</th>
                    <th scope="col">{{ 'attendanceEvents.col.collaborator' | transloco }}</th>
                    <th scope="col">{{ 'attendanceEvents.col.event' | transloco }}</th>
                    <th scope="col">{{ 'attendanceEvents.col.site' | transloco }}</th>
                    <th scope="col">{{ 'common.status' | transloco }}</th>
                    <th scope="col">{{ 'attendanceEvents.col.photo' | transloco }}</th>
                  </tr>
                  <tr class="nx-fila-filtros">
                    <th><input class="nx-campo__caja nx-mini" [placeholder]="'common.filter' | transloco" [attr.aria-label]="'attendanceEvents.col.date' | transloco" [value]="filters()['date'] ?? ''" (input)="setF('date', $event)" /></th>
                    <th><input class="nx-campo__caja nx-mini" [placeholder]="'common.filter' | transloco" [attr.aria-label]="'attendanceEvents.nameOrCode' | transloco" [value]="filters()['user'] ?? ''" (input)="setF('user', $event)" /></th>
                    <th>
                      <select class="nx-campo__caja nx-mini" [attr.aria-label]="'attendanceEvents.col.event' | transloco" [value]="filters()['event'] ?? ''" (change)="setF('event', $event)">
                        <option value="">{{ 'common.all' | transloco }}</option>
                        @for (o of eventCodes; track o) { <option [value]="o">{{ eventLabel(o) }}</option> }
                      </select>
                    </th>
                    <th><input class="nx-campo__caja nx-mini" [placeholder]="'common.filter' | transloco" [attr.aria-label]="'attendanceEvents.col.site' | transloco" [value]="filters()['site'] ?? ''" (input)="setF('site', $event)" /></th>
                    <th>
                      <select class="nx-campo__caja nx-mini" [attr.aria-label]="'common.status' | transloco" [value]="filters()['status'] ?? ''" (change)="setF('status', $event)">
                        <option value="">{{ 'common.all' | transloco }}</option>
                        @for (s of statusCodes; track s) { <option [value]="s">{{ statusLabel(s) }}</option> }
                      </select>
                    </th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (e of paged(); track e.recordId) {
                    <tr (click)="openDetail(e)">
                      <td class="nx-text-code">
                        <button type="button" class="nx-fila-link nx-text-numeric" (click)="openDetail(e); $event.stopPropagation()"
                                [attr.aria-label]="'attendanceEvents.openDetail' | transloco: { name: e.employeeName || e.userId }">
                          {{ e.serverTime | appDate: dateTime }}
                        </button>
                      </td>
                      <td>
                        {{ e.employeeName || e.userId }}
                        @if (e.employeeCode) { <br /><span class="nx-text-small nx-sec">{{ e.employeeCode }}</span> }
                      </td>
                      <td><span class="nx-chip nx-chip--{{ isInOut(e.eventType) ? 'info' : 'neutral' }}">{{ eventLabel(e.eventType) }}</span></td>
                      <td>
                        @if (e.siteless) {
                          <span class="nx-chip nx-chip--neutral" [matTooltip]="'attendanceEvents.sitelessTooltip' | transloco">{{ 'attendanceEvents.siteless' | transloco }}</span>
                        } @else {
                          <span class="nx-trunc">{{ e.workSite || '—' }}</span>
                        }
                      </td>
                      <td>
                        <app-status-chip [status]="e.status" [label]="statusLabel(e.status)"
                          [matTooltip]="rejectionTooltip(e)" [matTooltipDisabled]="!rejectionTooltip(e)" />
                      </td>
                      <td>
                        @if (e.hasEvidence) {
                          <mat-icon class="foto" [attr.aria-label]="'attendanceEvents.viewPhoto' | transloco">photo_camera</mat-icon>
                        } @else {
                          <span aria-hidden="true">—</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          @if (!loading() && filtered().length === 0) {
            <app-empty-state icon="search" [message]="'common.noResults' | transloco">
              <button mat-button type="button" (click)="clearFilters()">{{ 'common.clearFilters' | transloco }}</button>
            </app-empty-state>
          }

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
export class AttendanceEventsComponent {
  private readonly service = inject(AttendanceEventsService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);
  private readonly datePipe = new AppDatePipe();

  protected readonly periods = PERIODS;
  protected readonly eventCodes = EVENT_CODES;
  protected readonly statusCodes = STATUS_CODES;
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly dateTime = DATE_TIME;

  protected readonly events = signal<AttendanceEvent[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly exporting = signal(false);
  protected readonly period = signal<Period>('fortnight');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly filters = signal<Partial<Record<FilterKey, string>>>({});
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = pageSizePreference('attendance-events');

  /** Cambios de rango: recargan con la espera de la búsqueda en el servidor. */
  private readonly range$ = new Subject<void>();

  protected readonly activeFilters = computed(() => Object.values(this.filters()).filter((v) => !!v).length);

  protected readonly filtered = computed(() => {
    const f = this.filters();
    const has = (value: string, term?: string) => !term || value.toLowerCase().includes(term.toLowerCase());
    return this.events()
      .filter((e) => {
        if (!has(this.fmt(e.serverTime), f.date)) return false;
        if (!has(`${e.employeeName ?? ''} ${e.employeeCode ?? ''}`, f.user)) return false;
        if (f.event && e.eventType !== f.event) return false;
        const site = e.siteless ? this.transloco.translate('attendanceEvents.siteless') : (e.workSite ?? '');
        if (!has(site, f.site)) return false;
        return !f.status || e.status === f.status;
      })
      .sort((a, b) => b.serverTime.localeCompare(a.serverTime));
  });

  protected readonly paged = computed(() => {
    const size = this.pageSize();
    const start = this.pageIndex() * size;
    return this.filtered().slice(start < this.filtered().length ? start : 0).slice(0, size);
  });

  constructor() {
    this.range$.pipe(debounceTime(SEARCH_DEBOUNCE_MS), takeUntilDestroyed()).subscribe(() => this.reload());
    this.setPeriod('fortnight');
  }

  protected setPeriod(p: Period): void {
    this.period.set(p);
    if (p !== 'range') {
      const [from, to] = this.rangeFor(p);
      this.from.set(from);
      this.to.set(to);
      this.reload();
    }
  }

  protected onDate(which: 'from' | 'to', event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    if (which === 'from') this.from.set(v);
    else this.to.set(v);
    this.period.set('range');
    if (this.from() && this.to()) this.range$.next();
  }

  protected setF(key: FilterKey, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.filters.update((f) => ({ ...f, [key]: value }));
    this.pageIndex.set(0);
  }

  protected clearFilters(): void {
    this.filters.set({});
    this.pageIndex.set(0);
  }

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  protected reload(): void {
    if (!this.from() || !this.to()) return;
    this.loading.set(true);
    this.error.set(false);
    this.service.list(this.from(), this.to()).subscribe({
      next: (rows) => {
        this.events.set(rows);
        this.pageIndex.set(0);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Abre el detalle de la marcación, con su evidencia fotográfica si la tiene (P41, HU-13). */
  protected openDetail(event: AttendanceEvent): void {
    this.dialog.open(AttendanceDetailDialogComponent, {
      data: event,
      ariaLabel: this.transloco.translate('attendanceEvents.detail.title'),
    });
  }

  // La evidencia no se incluye en la exportación: su URL caduca a los pocos minutos y dentro de
  // un Excel sería un enlace roto que aparenta ser la foto.
  protected exportExcel(): void {
    const rowsToExport = this.filtered();
    if (rowsToExport.length === 0) return;
    this.exporting.set(true);
    setTimeout(() => {
      try {
        const header = [
          'attendanceEvents.col.date', 'attendanceEvents.col.collaborator', 'common.code', 'attendanceEvents.col.event',
          'attendanceEvents.col.site', 'common.status', 'attendanceEvents.col.rejection',
        ].map((k) => this.transloco.translate(k));
        const rows = rowsToExport.map((e) => [
          this.fmt(e.serverTime), e.employeeName ?? e.userId, e.employeeCode ?? '',
          this.eventLabel(e.eventType), e.siteless ? this.transloco.translate('attendanceEvents.siteless') : (e.workSite ?? ''),
          this.statusLabel(e.status), this.rejectionTooltip(e),
        ]);
        const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, this.transloco.translate('layout.nav.attendanceEvents'));
        XLSX.writeFile(book, `entradas-salidas-${this.from()}_a_${this.to()}.xlsx`);
      } finally {
        this.exporting.set(false);
      }
    });
  }

  // ---- helpers ----
  protected eventLabel(code: string): string { return eventLabel(code); }
  protected statusLabel(code: string): string { return recordStatusLabel(code); }

  /** Entrada y salida van en tono informativo; descansos y cambio de sitio, en neutral. */
  protected isInOut(code: string): boolean {
    return code === 'ENTRADA' || code === 'SALIDA';
  }

  /** Motivo de rechazo legible para el tooltip del estado (vacío si no aplica). */
  protected rejectionTooltip(e: AttendanceEvent): string {
    if (!e.rejectionReason) return '';
    return rejectionLabel(e.rejectionReason);
  }

  private fmt(iso: string): string {
    return this.datePipe.transform(iso, DATE_TIME);
  }

  /** [from, to] en yyyy-MM-dd para el preset dado (semana lun–dom, quincena 1–15/16–fin, mes completo). */
  private rangeFor(p: Period): [string, string] {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (p === 'week') {
      const day = (now.getDay() + 6) % 7; // lunes = 0
      const monday = new Date(y, m, now.getDate() - day);
      const sunday = new Date(y, m, now.getDate() - day + 6);
      return [iso(monday), iso(sunday)];
    }
    if (p === 'fortnight') {
      if (now.getDate() <= 15) return [iso(new Date(y, m, 1)), iso(new Date(y, m, 15))];
      return [iso(new Date(y, m, 16)), iso(new Date(y, m + 1, 0))];
    }
    // month
    return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  }
}
