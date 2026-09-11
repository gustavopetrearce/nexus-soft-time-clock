import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import * as XLSX from 'xlsx';

import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { AttendanceDetailDialogComponent } from './attendance-detail-dialog.component';
import { AttendanceEvent, EVENT_LABELS, EVENT_OPTIONS, REJECTION_LABELS, STATUS_LABELS } from './attendance-events.models';
import { AttendanceEventsService } from './attendance-events.service';

type Period = 'week' | 'fortnight' | 'month' | 'range';

/**
 * Reporte de entradas y salidas: cada registro de asistencia con fecha/hora, colaborador,
 * evento (entrada/salida/comida) y sitio. Presets semana/quincena/mes + rango, filtros por
 * columna (Excel) y exportación. Requiere {@code report:export}.
 */
@Component({
  selector: 'app-attendance-events',
  standalone: true,
  imports: [
    MatCardModule, MatTableModule, MatButtonModule, MatButtonToggleModule, MatDialogModule,
    MatIconModule, MatProgressBarModule, MatTooltipModule, PageHeaderComponent, EmptyStateComponent,
  ],
  template: `
    <app-page-header title="Entradas y salidas" subtitle="Registros individuales de asistencia: a qué hora ficha cada persona">
      <button mat-flat-button color="primary" (click)="exportExcel()"><mat-icon>download</mat-icon> Exportar Excel</button>
    </app-page-header>

    <mat-card>
      <mat-card-content>
        <!-- Presets de periodo -->
        <div class="period-bar">
          <mat-button-toggle-group [value]="period()" (change)="setPeriod($event.value)" hideSingleSelectionIndicator>
            <mat-button-toggle value="week">Semana</mat-button-toggle>
            <mat-button-toggle value="fortnight">Quincena</mat-button-toggle>
            <mat-button-toggle value="month">Mes</mat-button-toggle>
            <mat-button-toggle value="range">Rango</mat-button-toggle>
          </mat-button-toggle-group>

          <div class="dates">
            <label>Desde <input type="date" [value]="from()" (change)="onDate('from', $event)" /></label>
            <label>Hasta <input type="date" [value]="to()" (change)="onDate('to', $event)" /></label>
          </div>
          <span class="spacer"></span>
          @if (hasColumnFilters()) {
            <button mat-button (click)="clearFilters()"><mat-icon>filter_alt_off</mat-icon> Limpiar</button>
          }
          <span class="muted">{{ filtered().length }} registros</span>
        </div>

        @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
        @if (error()) { <p class="error-text">{{ error() }}</p> }

        <div class="table-wrap">
          <table mat-table [dataSource]="filtered()" style="width:100%">
            <ng-container matColumnDef="date">
              <th mat-header-cell *matHeaderCellDef>Fecha y hora</th>
              <td mat-cell *matCellDef="let e"><span class="mono">{{ fmt(e.serverTime) }}</span></td>
            </ng-container>
            <ng-container matColumnDef="user">
              <th mat-header-cell *matHeaderCellDef>Colaborador</th>
              <td mat-cell *matCellDef="let e">
                <div class="nm">{{ e.employeeName || e.userId }}</div>
                <div class="sub">{{ e.employeeCode || '—' }}</div>
              </td>
            </ng-container>
            <ng-container matColumnDef="event">
              <th mat-header-cell *matHeaderCellDef>Evento</th>
              <td mat-cell *matCellDef="let e"><span class="chip" [class.in]="e.eventType === 'ENTRADA' || e.eventType === 'FIN_DESCANSO'" [class.out]="e.eventType === 'SALIDA' || e.eventType === 'INICIO_DESCANSO'">{{ eventLabel(e.eventType) }}</span></td>
            </ng-container>
            <ng-container matColumnDef="site">
              <th mat-header-cell *matHeaderCellDef>Centro de trabajo</th>
              <td mat-cell *matCellDef="let e">
                @if (e.siteless) {
                  <span class="siteless" title="Registro sin centro: no se validó geocerca">Sin centro</span>
                } @else {
                  {{ e.workSite || '—' }}
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Estado</th>
              <td mat-cell *matCellDef="let e"><span class="chip" [class.ok]="e.status === 'ACCEPTED'" [class.bad]="e.status === 'REJECTED'" [matTooltip]="rejectionTooltip(e)" [matTooltipDisabled]="!rejectionTooltip(e)">{{ statusLabel(e.status) }}</span></td>
            </ng-container>

            <!-- Fila de filtros (Excel) -->
            <ng-container matColumnDef="date-f">
              <th mat-header-cell *matHeaderCellDef class="fcell"><input class="cf" placeholder="Filtrar…" (input)="setF('date', $event)" /></th>
            </ng-container>
            <ng-container matColumnDef="user-f">
              <th mat-header-cell *matHeaderCellDef class="fcell"><input class="cf" placeholder="Nombre o código" (input)="setF('user', $event)" /></th>
            </ng-container>
            <ng-container matColumnDef="event-f">
              <th mat-header-cell *matHeaderCellDef class="fcell">
                <select class="cf" (change)="setF('event', $event)"><option value="">Todos</option>@for (o of eventOptions; track o.code) { <option [value]="o.code">{{ o.label }}</option> }</select>
              </th>
            </ng-container>
            <ng-container matColumnDef="site-f">
              <th mat-header-cell *matHeaderCellDef class="fcell"><input class="cf" placeholder="Filtrar…" (input)="setF('site', $event)" /></th>
            </ng-container>
            <ng-container matColumnDef="status-f">
              <th mat-header-cell *matHeaderCellDef class="fcell">
                <select class="cf" (change)="setF('status', $event)"><option value="">Todos</option><option value="ACCEPTED">Aceptado</option><option value="REJECTED">Rechazado</option><option value="PENDING_REVIEW">En revisión</option></select>
              </th>
            </ng-container>
            <ng-container matColumnDef="evidence">
              <th mat-header-cell *matHeaderCellDef class="ecell">Foto</th>
              <td mat-cell *matCellDef="let e" class="ecell">
                @if (e.hasEvidence) {
                  <mat-icon class="has-photo" matTooltip="Ver evidencia fotográfica">photo_camera</mat-icon>
                } @else {
                  <span class="muted">—</span>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="evidence-f">
              <th mat-header-cell *matHeaderCellDef class="fcell"></th>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-header-row *matHeaderRowDef="filterColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns" class="clickable" (click)="openDetail(row)"></tr>
          </table>
        </div>

        @if (!loading() && filtered().length === 0) {
          <app-empty-state icon="fact_check" message="No hay registros de asistencia en este periodo." />
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      .period-bar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: var(--sp-4); }
      .dates { display: flex; gap: 12px; }
      .dates label { font-size: var(--font-small); color: var(--text-muted); display: flex; flex-direction: column; gap: 4px; }
      .dates input { border: 1px solid var(--border-strong); border-radius: 8px; padding: 8px 10px; background: var(--surface); color: var(--text); font: inherit; }
      .spacer { flex: 1; }
      .mono { font-variant-numeric: tabular-nums; }
      .nm { font-weight: 600; }
      .sub { font-size: var(--font-small); color: var(--text-muted); }
      td.mat-mdc-cell { white-space: nowrap; }
      .chip { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: var(--font-small); font-weight: 600; background: var(--neutral-bg); color: var(--neutral); }
      .chip.in { background: var(--success-bg); color: var(--success); }
      .chip.out { background: var(--warning-bg); color: var(--warning); }
      .chip.ok { background: var(--success-bg); color: var(--success); }
      .chip.bad { background: var(--danger-bg); color: var(--danger); }
      .fcell { padding-top: 6px !important; padding-bottom: 6px !important; background: var(--surface-2); }
      .ecell { width: 64px; text-align: center; }
      .has-photo { color: var(--brand); vertical-align: middle; }
      tr.clickable { cursor: pointer; }
      tr.clickable:hover { background: var(--surface-2); }
      .cf { width: 100%; min-width: 110px; padding: 7px 9px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; font-size: var(--font-small); }
      .cf:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
      select.cf { cursor: pointer; }
      .siteless { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: var(--font-small); font-weight: 600; background: var(--warning-bg); color: var(--warning); }
    `,
  ],
})
export class AttendanceEventsComponent {
  private readonly service = inject(AttendanceEventsService);
  private readonly dialog = inject(MatDialog);

  protected readonly columns = ['date', 'user', 'event', 'site', 'status', 'evidence'];
  protected readonly filterColumns = ['date-f', 'user-f', 'event-f', 'site-f', 'status-f', 'evidence-f'];
  protected readonly eventOptions = EVENT_OPTIONS;

  protected readonly events = signal<AttendanceEvent[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly period = signal<Period>('fortnight');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly filters = signal<Record<string, string>>({});

  protected readonly hasColumnFilters = computed(() => Object.values(this.filters()).some((v) => !!v));

  protected readonly filtered = computed(() => {
    const f = this.filters();
    return this.events().filter((e) => {
      if (f['date'] && !this.fmt(e.serverTime).toLowerCase().includes(f['date'].toLowerCase())) return false;
      if (f['user'] && !`${e.employeeName ?? ''} ${e.employeeCode ?? ''}`.toLowerCase().includes(f['user'].toLowerCase())) return false;
      if (f['event'] && e.eventType !== f['event']) return false;
      if (f['site'] && !(e.siteless ? 'sin centro' : (e.workSite ?? '').toLowerCase()).includes(f['site'].toLowerCase())) return false;
      if (f['status'] && e.status !== f['status']) return false;
      return true;
    });
  });

  constructor() {
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
    if (which === 'from') this.from.set(v); else this.to.set(v);
    this.period.set('range');
    if (this.from() && this.to()) this.reload();
  }

  protected setF(key: string, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.filters.update((f) => ({ ...f, [key]: value }));
  }

  protected clearFilters(): void {
    this.filters.set({});
  }

  protected reload(): void {
    if (!this.from() || !this.to()) return;
    this.loading.set(true);
    this.error.set(null);
    this.service.list(this.from(), this.to()).subscribe({
      next: (rows) => { this.events.set(rows); this.loading.set(false); },
      error: () => { this.error.set('No se pudo cargar el reporte (¿permiso report:export?).'); this.loading.set(false); },
    });
  }

  /** Abre el detalle de la marcación, con su evidencia fotográfica si la tiene (HU-13). */
  protected openDetail(event: AttendanceEvent): void {
    this.dialog.open(AttendanceDetailDialogComponent, { data: event, autoFocus: false });
  }

  // La evidencia no se incluye en la exportación: su URL caduca a los pocos minutos y dentro de
  // un Excel sería un enlace roto que aparenta ser la foto.
  protected exportExcel(): void {
    const header = ['Fecha y hora', 'Colaborador', 'Código', 'Evento', 'Centro de trabajo', 'Estado', 'Motivo de rechazo'];
    const rows = this.filtered().map((e) => [
      this.fmt(e.serverTime), e.employeeName ?? e.userId, e.employeeCode ?? '',
      this.eventLabel(e.eventType), e.siteless ? 'Sin centro' : (e.workSite ?? ''),
      this.statusLabel(e.status), this.rejectionTooltip(e),
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Entradas y salidas');
    XLSX.writeFile(book, `entradas-salidas-${this.from()}_a_${this.to()}.xlsx`);
  }

  // ---- helpers ----
  protected eventLabel(code: string): string { return EVENT_LABELS[code] ?? code; }
  protected statusLabel(code: string): string { return STATUS_LABELS[code] ?? code; }

  /** Motivo de rechazo legible para el tooltip del estado (vacío si no aplica). */
  protected rejectionTooltip(e: AttendanceEvent): string {
    if (!e.rejectionReason) return '';
    return REJECTION_LABELS[e.rejectionReason] ?? e.rejectionReason;
  }

  protected fmt(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
