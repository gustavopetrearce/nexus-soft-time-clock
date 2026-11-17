import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { debounceTime, merge } from 'rxjs';

import { AuthStore } from '../../core/auth/auth.store';
import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { AppNumberPipe } from '../../core/i18n/app-number.pipe';
import { AlertComponent } from '../../core/ui/alert.component';
import { PAGE_SIZE_OPTIONS, debouncedSearch, pageSizePreference } from '../../core/ui/catalog';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../core/ui/loading-bar.component';
import { NotificationService } from '../../core/ui/notification.service';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { ScrollDirective } from '../../core/ui/scroll.directive';
import { StatusChipComponent } from '../../core/ui/status-chip.component';
import { PermitDecision, PermitDecisionDialogComponent, PermitDecisionMode } from './permit-decision-dialog.component';
import { PermitDialogComponent } from './permit-dialog.component';
import {
  PAY_STATUSES,
  PERMIT_REASONS,
  PERMIT_STATUSES,
  PERMIT_TYPES,
  PayStatus,
  Permit,
  PermitFilters,
  PermitReason,
  PermitStatus,
  PermitType,
  shortTime,
} from './permit.models';
import { PermitService } from './permit.service';

/** Tono del chip de goce: pendiente en aviso, con goce en éxito, sin goce neutro. */
const PAY_TONE: Record<PayStatus, string> = { PENDING_REVIEW: 'PENDING_REVIEW', WITH_PAY: 'APPROVED', WITHOUT_PAY: 'INACTIVE' };

/**
 * Permisos (portal): entradas tarde, salidas temprano y faltas, en formato de reporte. Los registra
 * admin, RR. HH. o supervisor ({@code permit:manage}) y nacen aprobados. «Goce de sueldo» solo lo
 * ve RR. HH. ({@code permit:pay}), que puede revisar un permiso que aprobó otra persona y decidir
 * con o sin goce. Filtros en el servidor: búsqueda (400 ms), tipo, motivo, goce, estatus y periodo.
 */
@Component({
  selector: 'app-permits',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
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
    AlertComponent,
    EmptyStateComponent,
    LoadingBarComponent,
    PageHeaderComponent,
    ScrollDirective,
    StatusChipComponent,
  ],
  styles: [
    `
      mat-form-field { width: 100%; }
      td { white-space: nowrap; }
      td.notas .nx-trunc { max-width: calc(var(--nx-space-16) * 3); }
      .sub { display: block; }
    `,
  ],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'layout.nav.permits' | transloco">
      <a mat-stroked-button routerLink="/permits/incapacities"><mat-icon>personal_injury</mat-icon>{{ 'layout.nav.incapacities' | transloco }}</a>
      @if (canManage) {
        <button mat-flat-button type="button" (click)="openCreate()"><mat-icon>add</mat-icon>{{ 'permits.newPermit' | transloco }}</button>
      }
    </app-page-header>

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
        <button mat-stroked-button type="button" (click)="reload()">{{ 'common.retry' | transloco }}</button>
      </app-empty-state>
    } @else {
      <section class="nx-panel nx-panel--listado">
        <div class="nx-filtros" [formGroup]="filters">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-buscador">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>{{ 'permits.search' | transloco }}</mat-label>
            <input matInput type="search" formControlName="search" autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'permits.type' | transloco }}</mat-label>
            <mat-select formControlName="type">
              <mat-option value="">{{ 'common.all' | transloco }}</mat-option>
              @for (t of types; track t) { <mat-option [value]="t">{{ 'permits.types.' + t | transloco }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'permits.reason' | transloco }}</mat-label>
            <mat-select formControlName="reason">
              <mat-option value="">{{ 'common.all' | transloco }}</mat-option>
              @for (r of reasons; track r) { <mat-option [value]="r">{{ 'permits.reasons.' + r | transloco }}</mat-option> }
            </mat-select>
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
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-campo--fecha">
            <mat-label>{{ 'period.from' | transloco }}</mat-label>
            <input matInput type="date" formControlName="from" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-campo--fecha">
            <mat-label>{{ 'period.to' | transloco }}</mat-label>
            <input matInput type="date" formControlName="to" />
          </mat-form-field>
        </div>

        @if (conflict()) {
          <app-alert tone="error">{{ 'permits.alreadyCancelled' | transloco }}</app-alert>
        }

        @if (!loading() && permits().length === 0) {
          @if (hasFilters()) {
            <app-empty-state icon="search" [message]="'common.noResults' | transloco">
              <button mat-button type="button" (click)="clearFilters()">{{ 'common.clearFilters' | transloco }}</button>
            </app-empty-state>
          } @else {
            <app-empty-state icon="event_busy" [message]="'permits.empty' | transloco" />
          }
        } @else {
          <div class="nx-tabla">
            <div class="nx-tabla__scroll nx-scroll" nxScroll>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{{ 'permits.collaborator' | transloco }}</th>
                    <th scope="col">{{ 'permits.type' | transloco }}</th>
                    <th scope="col">{{ 'permits.reason' | transloco }}</th>
                    <th scope="col" class="num">{{ 'permits.period' | transloco }}</th>
                    <th scope="col" class="num">{{ 'permits.days' | transloco }}</th>
                    <th scope="col">{{ 'permits.pay' | transloco }}</th>
                    <th scope="col">{{ 'common.status' | transloco }}</th>
                    <th scope="col" class="nx-col-sec">{{ 'permits.grantedBy' | transloco }}</th>
                    <th scope="col" class="nx-col-sec">{{ 'permits.notes' | transloco }}</th>
                    <th scope="col" class="nx-col-acciones">{{ 'common.actions' | transloco }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of permits(); track p.id) {
                    <tr>
                      <td>
                        <span class="nx-trunc">{{ p.userName || p.userId }}</span>
                        @if (p.employeeCode) { <span class="sub nx-sec nx-text-small">{{ p.employeeCode }}</span> }
                      </td>
                      <td>{{ 'permits.types.' + p.type | transloco }}</td>
                      <td>{{ 'permits.reasons.' + p.reason | transloco }}</td>
                      <td class="num nx-text-numeric">
                        {{ p.startDate | appDate: 'dd/MM/yyyy' }}
                        @if (p.type === 'ABSENCE') {
                          @if (p.endDate !== p.startDate) { – {{ p.endDate | appDate: 'dd/MM/yyyy' }} }
                        } @else {
                          · {{ time(p.timeAt) }}
                        }
                      </td>
                      <td class="num nx-text-numeric">{{ p.days | appNumber }}</td>
                      <td>
                        <app-status-chip [status]="payTone[p.payStatus]" [label]="'permits.payStatus.' + p.payStatus | transloco"
                          [matTooltip]="p.payDecidedByName ? ('permits.decidedBy' | transloco) + ': ' + p.payDecidedByName + (p.payNote ? ' — ' + p.payNote : '') : ''" />
                      </td>
                      <td>
                        <app-status-chip [status]="p.status" [label]="'permits.status.' + p.status | transloco"
                          [matTooltip]="p.status === 'CANCELLED' ? (p.cancelledByName || '') + (p.cancelNote ? ' — ' + p.cancelNote : '') : ''" />
                      </td>
                      <td class="nx-col-sec"><span class="nx-trunc">{{ p.grantedByName || '—' }}</span></td>
                      <td class="nx-col-sec notas"><span class="nx-trunc" [attr.title]="p.notes || null">{{ p.notes || '—' }}</span></td>
                      <td class="nx-col-acciones">
                        @if (p.status === 'APPROVED') {
                          <span class="nx-acciones-fila">
                            @if (canDecidePay) {
                              <button mat-stroked-button type="button" [disabled]="savingId() === p.id" (click)="decide(p, 'pay')">
                                <mat-icon>payments</mat-icon>{{ 'permits.payAction' | transloco }}
                              </button>
                            }
                            @if (canManage) {
                              <button mat-button type="button" [disabled]="savingId() === p.id" (click)="decide(p, 'cancel')">
                                {{ 'permits.cancelAction' | transloco }}
                              </button>
                            }
                          </span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        <mat-paginator
          [length]="total()"
          [pageSize]="size()"
          [pageIndex]="page()"
          [pageSizeOptions]="pageSizeOptions"
          (page)="onPage($event)"
        />
      </section>
    }
  `,
})
export class PermitsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(PermitService);
  private readonly store = inject(AuthStore);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly types = PERMIT_TYPES;
  protected readonly reasons = PERMIT_REASONS;
  protected readonly statuses = PERMIT_STATUSES;
  protected readonly payStatuses = PAY_STATUSES;
  protected readonly payTone = PAY_TONE;
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly canManage = this.store.hasPermission('permit:manage');
  protected readonly canDecidePay = this.store.hasPermission('permit:pay');
  protected readonly time = shortTime;

  protected readonly permits = signal<Permit[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly savingId = signal<string | null>(null);
  protected readonly conflict = signal(false);

  protected readonly page = signal(0);
  protected readonly size = pageSizePreference('permits');
  protected readonly total = signal(0);

  protected readonly filters = this.fb.nonNullable.group({
    search: [''],
    type: ['' as PermitType | ''],
    reason: ['' as PermitReason | ''],
    payStatus: ['' as PayStatus | ''],
    status: ['' as PermitStatus | ''],
    from: [''],
    to: [''],
  });

  constructor() {
    const c = this.filters.controls;
    merge(
      debouncedSearch(c.search.valueChanges),
      c.type.valueChanges,
      c.reason.valueChanges,
      c.payStatus.valueChanges,
      c.status.valueChanges,
      // Las fechas se teclean por partes: esperar a que el valor se asiente.
      merge(c.from.valueChanges, c.to.valueChanges).pipe(debounceTime(400)),
    )
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.applyFilter());
    this.reload();
  }

  protected hasFilters(): boolean {
    return Object.values(this.filters.getRawValue()).some((v) => !!String(v).trim());
  }

  protected openCreate(): void {
    this.dialog
      .open(PermitDialogComponent, { width: '640px', maxWidth: '96vw' })
      .afterClosed()
      .subscribe((created) => {
        if (created) this.reload();
      });
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(false);
    const f = this.filters.getRawValue();
    const filters: PermitFilters = { ...f, search: f.search.trim() || undefined };
    this.service.list(this.page(), this.size(), filters).subscribe({
      next: (result) => {
        this.permits.set(result.content);
        this.total.set(result.totalElements);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex);
    this.size.set(event.pageSize);
    this.reload();
  }

  protected applyFilter(): void {
    this.page.set(0);
    this.conflict.set(false);
    this.reload();
  }

  protected clearFilters(): void {
    this.filters.reset({}, { emitEvent: false });
    this.applyFilter();
  }

  protected decide(p: Permit, mode: PermitDecisionMode): void {
    this.dialog
      .open<PermitDecisionDialogComponent, unknown, PermitDecision>(PermitDecisionDialogComponent, {
        data: { mode, permit: p },
        width: '480px',
        maxWidth: '96vw',
      })
      .afterClosed()
      .subscribe((decision) => {
        if (!decision) return;
        this.savingId.set(p.id);
        this.conflict.set(false);
        const call =
          mode === 'pay' && decision.payStatus
            ? this.service.decidePay(p.id, decision.payStatus, decision.note)
            : this.service.cancel(p.id, decision.note);
        call.subscribe({
          next: () => {
            this.savingId.set(null);
            this.notify.success(this.transloco.translate(mode === 'pay' ? 'permits.payDecided' : 'permits.cancelled'));
            this.reload();
          },
          error: (err: unknown) => {
            this.savingId.set(null);
            if (err instanceof HttpErrorResponse && err.status === 409) {
              this.conflict.set(true);
              this.reload();
            } else {
              this.notify.error(this.transloco.translate('permits.actionError'));
            }
          },
        });
      });
  }
}
