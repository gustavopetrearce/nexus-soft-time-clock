import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { debounceTime, merge } from 'rxjs';

import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { AppNumberPipe } from '../../core/i18n/app-number.pipe';
import { PAGE_SIZE_OPTIONS, pageSizePreference } from '../../core/ui/catalog';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../core/ui/loading-bar.component';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { ScrollDirective } from '../../core/ui/scroll.directive';
import { StatusChipComponent } from '../../core/ui/status-chip.component';
import { exportIncapacitiesToCsv, exportIncapacitiesToExcel, exportIncapacitiesToPdf } from './permit-export.util';
import { PAY_STATUSES, PERMIT_STATUSES, PayStatus, Permit, PermitPhase, PermitStatus, isoToday, permitPhase } from './permit.models';
import { PermitService } from './permit.service';

type ExportKind = 'excel' | 'pdf' | 'csv';

const PHASES: readonly PermitPhase[] = ['UPCOMING', 'IN_PROGRESS', 'FINISHED'];
const PAY_TONE: Record<PayStatus, string> = { PENDING_REVIEW: 'PENDING_REVIEW', WITH_PAY: 'APPROVED', WITHOUT_PAY: 'INACTIVE' };
const PHASE_TONE: Record<PermitPhase, string> = { UPCOMING: 'OPEN', IN_PROGRESS: 'ACTIVE', FINISHED: 'CLOSED' };

/**
 * Reporte de incapacidades (dentro de Permisos): colaboradores con permiso de falta por motivo
 * INCAPACIDAD, con o sin goce de sueldo, el periodo aprobado y su estatus (aprobado/cancelado +
 * vigencia: próxima, en curso, concluida). El periodo recarga del servidor; búsqueda, goce,
 * estatus y vigencia filtran lo cargado. Totales y exportación (Excel · PDF · CSV) respetan los filtros.
 */
@Component({
  selector: 'app-incapacities',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    MatSelectModule,
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
      td { white-space: nowrap; }
      .sub { display: block; }
      .nx-kpis { margin-bottom: var(--nx-space-4); }
      .nx-kpi__concepto mat-icon { width: var(--nx-icon-size-md); height: var(--nx-icon-size-md); font-size: var(--nx-icon-size-md); }
      .exportar .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
    `,
  ],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'permits.incapacities.title' | transloco">
      <a mat-stroked-button routerLink="/permits"><mat-icon>arrow_back</mat-icon>{{ 'layout.nav.permits' | transloco }}</a>
    </app-page-header>

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
        <button mat-stroked-button type="button" (click)="reload()">{{ 'common.retry' | transloco }}</button>
      </app-empty-state>
    } @else {
      <section class="nx-panel nx-panel--listado">
        <div class="nx-filtros nx-filtros--reporte" [formGroup]="form">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-buscador">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>{{ 'permits.search' | transloco }}</mat-label>
            <input matInput type="search" formControlName="search" autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'period.from' | transloco }}</mat-label>
            <input matInput type="date" formControlName="from" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'period.to' | transloco }}</mat-label>
            <input matInput type="date" formControlName="to" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'permits.pay' | transloco }}</mat-label>
            <mat-select formControlName="payStatus">
              <mat-option value="">{{ 'common.all' | transloco }}</mat-option>
              @for (p of payStatuses; track p) { <mat-option [value]="p">{{ 'permits.payStatus.' + p | transloco }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'common.status' | transloco }}</mat-label>
            <mat-select formControlName="status">
              <mat-option value="">{{ 'common.all' | transloco }}</mat-option>
              @for (s of statuses; track s) { <mat-option [value]="s">{{ 'permits.status.' + s | transloco }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'permits.phase.label' | transloco }}</mat-label>
            <mat-select formControlName="phase">
              <mat-option value="">{{ 'common.all' | transloco }}</mat-option>
              @for (ph of phases; track ph) { <mat-option [value]="ph">{{ 'permits.phase.' + ph | transloco }}</mat-option> }
            </mat-select>
          </mat-form-field>

          <div class="nx-filtros__acciones">
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

        <div class="nx-kpis">
          <div class="nx-kpi nx-kpi--brand">
            <span class="nx-kpi__label">{{ 'permits.incapacities.kpi.total' | transloco }}</span>
            <span class="nx-kpi__concepto nx-kpi__concepto--brand"><mat-icon fontSet="material-icons-outlined" aria-hidden="true">personal_injury</mat-icon></span>
            <span class="nx-kpi__fila"><span class="nx-kpi__valor nx-text-numeric">{{ totals().count | appNumber }}</span></span>
          </div>
          <div class="nx-kpi nx-kpi--info">
            <span class="nx-kpi__label">{{ 'permits.incapacities.kpi.days' | transloco }}</span>
            <span class="nx-kpi__concepto nx-kpi__concepto--info"><mat-icon fontSet="material-icons-outlined" aria-hidden="true">event</mat-icon></span>
            <span class="nx-kpi__fila"><span class="nx-kpi__valor nx-text-numeric">{{ totals().days | appNumber }}</span></span>
          </div>
          <div class="nx-kpi nx-kpi--success">
            <span class="nx-kpi__label">{{ 'permits.payStatus.WITH_PAY' | transloco }}</span>
            <span class="nx-kpi__concepto nx-kpi__concepto--success"><mat-icon fontSet="material-icons-outlined" aria-hidden="true">paid</mat-icon></span>
            <span class="nx-kpi__fila"><span class="nx-kpi__valor nx-text-numeric">{{ totals().withPay | appNumber }}</span></span>
          </div>
          <div class="nx-kpi nx-kpi--error">
            <span class="nx-kpi__label">{{ 'permits.payStatus.WITHOUT_PAY' | transloco }}</span>
            <span class="nx-kpi__concepto nx-kpi__concepto--error"><mat-icon fontSet="material-icons-outlined" aria-hidden="true">money_off</mat-icon></span>
            <span class="nx-kpi__fila"><span class="nx-kpi__valor nx-text-numeric">{{ totals().withoutPay | appNumber }}</span></span>
          </div>
          <div class="nx-kpi nx-kpi--warning">
            <span class="nx-kpi__label">{{ 'permits.payStatus.PENDING_REVIEW' | transloco }}</span>
            <span class="nx-kpi__concepto nx-kpi__concepto--warning"><mat-icon fontSet="material-icons-outlined" aria-hidden="true">hourglass_empty</mat-icon></span>
            <span class="nx-kpi__fila"><span class="nx-kpi__valor nx-text-numeric">{{ totals().pending | appNumber }}</span></span>
          </div>
        </div>

        @if (!loading() && rows().length === 0) {
          <app-empty-state icon="personal_injury" [message]="'permits.incapacities.empty' | transloco" />
        } @else if (!loading() && filtered().length === 0) {
          <app-empty-state icon="search" [message]="'common.noResults' | transloco">
            <button mat-button type="button" (click)="clearFilters()">{{ 'common.clearFilters' | transloco }}</button>
          </app-empty-state>
        } @else {
          <div class="nx-tabla">
            <div class="nx-tabla__scroll nx-scroll" nxScroll>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{{ 'permits.collaborator' | transloco }}</th>
                    <th scope="col" class="num">{{ 'period.from' | transloco }}</th>
                    <th scope="col" class="num">{{ 'period.to' | transloco }}</th>
                    <th scope="col" class="num">{{ 'permits.days' | transloco }}</th>
                    <th scope="col">{{ 'permits.pay' | transloco }}</th>
                    <th scope="col" class="nx-col-sec">{{ 'permits.decidedBy' | transloco }}</th>
                    <th scope="col">{{ 'common.status' | transloco }}</th>
                    <th scope="col" class="nx-col-sec">{{ 'permits.grantedBy' | transloco }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of paged(); track p.id) {
                    <tr>
                      <td>
                        <span class="nx-trunc">{{ p.userName || p.userId }}</span>
                        @if (p.employeeCode) { <span class="sub nx-sec nx-text-small">{{ p.employeeCode }}</span> }
                      </td>
                      <td class="num nx-text-numeric">{{ p.startDate | appDate: 'dd/MM/yyyy' }}</td>
                      <td class="num nx-text-numeric">{{ p.endDate | appDate: 'dd/MM/yyyy' }}</td>
                      <td class="num nx-text-numeric">{{ p.days | appNumber }}</td>
                      <td><app-status-chip [status]="payTone[p.payStatus]" [label]="'permits.payStatus.' + p.payStatus | transloco" /></td>
                      <td class="nx-col-sec"><span class="nx-trunc">{{ p.payDecidedByName || '—' }}</span></td>
                      <td>
                        @if (phaseOf(p); as ph) {
                          <app-status-chip [status]="phaseTone[ph]" [label]="'permits.phase.' + ph | transloco" />
                        } @else {
                          <app-status-chip [status]="p.status" [label]="'permits.status.' + p.status | transloco" />
                        }
                      </td>
                      <td class="nx-col-sec"><span class="nx-trunc">{{ p.grantedByName || '—' }}</span></td>
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
export class IncapacitiesComponent {
  private readonly service = inject(PermitService);

  protected readonly payStatuses = PAY_STATUSES;
  protected readonly statuses = PERMIT_STATUSES;
  protected readonly phases = PHASES;
  protected readonly payTone = PAY_TONE;
  protected readonly phaseTone = PHASE_TONE;
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  protected readonly form = inject(FormBuilder).nonNullable.group({
    search: [''],
    from: [`${new Date().getFullYear()}-01-01`],
    to: [`${new Date().getFullYear()}-12-31`],
    payStatus: ['' as PayStatus | ''],
    status: ['' as PermitStatus | ''],
    phase: ['' as PermitPhase | ''],
  });

  protected readonly rows = signal<Permit[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly exporting = signal(false);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = pageSizePreference('incapacities');

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  private readonly today = isoToday();

  protected readonly filtered = computed(() => {
    const f = this.value();
    const q = (f.search ?? '').trim().toLowerCase();
    return this.rows().filter(
      (p) =>
        (!q || (p.userName ?? '').toLowerCase().includes(q) || (p.employeeCode ?? '').toLowerCase().includes(q)) &&
        (!f.payStatus || p.payStatus === f.payStatus) &&
        (!f.status || p.status === f.status) &&
        (!f.phase || permitPhase(p, this.today) === f.phase),
    );
  });

  protected readonly paged = computed(() => {
    const size = this.pageSize();
    const rows = this.filtered();
    let start = this.pageIndex() * size;
    if (start >= rows.length) start = 0;
    return rows.slice(start, start + size);
  });

  /** Totales de lo filtrado; los días solo de permisos aprobados (un cancelado no ausenta a nadie). */
  protected readonly totals = computed(() => {
    const rows = this.filtered();
    const active = rows.filter((p) => p.status === 'APPROVED');
    return {
      count: rows.length,
      days: active.reduce((sum, p) => sum + p.days, 0),
      withPay: active.filter((p) => p.payStatus === 'WITH_PAY').length,
      withoutPay: active.filter((p) => p.payStatus === 'WITHOUT_PAY').length,
      pending: active.filter((p) => p.payStatus === 'PENDING_REVIEW').length,
    };
  });

  constructor() {
    const c = this.form.controls;
    merge(c.from.valueChanges, c.to.valueChanges)
      .pipe(debounceTime(400), takeUntilDestroyed())
      .subscribe(() => this.reload());
    merge(c.search.valueChanges, c.payStatus.valueChanges, c.status.valueChanges, c.phase.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.pageIndex.set(0));
    this.reload();
  }

  protected phaseOf(p: Permit): PermitPhase | null {
    return permitPhase(p, this.today);
  }

  protected reload(): void {
    const { from, to } = this.form.getRawValue();
    this.loading.set(true);
    this.error.set(false);
    this.service.incapacities({ from, to }).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.pageIndex.set(0);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  protected clearFilters(): void {
    this.form.patchValue({ search: '', payStatus: '', status: '', phase: '' });
  }

  protected export(kind: ExportKind): void {
    const rows = this.filtered();
    if (rows.length === 0) return;
    this.exporting.set(true);
    // Un tick para pintar el indicador antes del trabajo síncrono de las librerías.
    setTimeout(() => {
      try {
        if (kind === 'excel') exportIncapacitiesToExcel(rows);
        else if (kind === 'pdf') exportIncapacitiesToPdf(rows, this.form.getRawValue());
        else exportIncapacitiesToCsv(rows);
      } finally {
        this.exporting.set(false);
      }
    });
  }
}
