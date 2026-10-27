import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { NotificationService } from '../../core/ui/notification.service';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { StatusChipComponent } from '../../core/ui/status-chip.component';
import { ResolveVacation, VacationRequest, VacationStatus } from './vacation.models';
import { VacationService } from './vacation.service';
import { VacationRequestDialogComponent } from './vacation-request-dialog.component';

/**
 * Bandeja de solicitudes de vacaciones (RF-09 ampliado): tabla + drawer de resolución,
 * espejo del flujo de Incidencias. El supervisor aprueba/rechaza con nota sin fricción.
 * Requiere {@code vacation:approve}.
 */
@Component({
  selector: 'app-vacations',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatDialogModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressBarModule,
    AppDatePipe,
    PageHeaderComponent,
    StatusChipComponent,
    EmptyStateComponent,
    TranslocoPipe,
  ],
  template: `
    <app-page-header [title]="'layout.nav.vacations' | transloco" [subtitle]="'vacations.subtitle' | transloco">
      @if (pendingCount() > 0) {
        <span class="count-pill"><mat-icon>schedule</mat-icon> {{ 'vacations.pendingCount' | transloco: { n: pendingCount() } }}</span>
      }
      <button mat-flat-button color="primary" (click)="openCreate()"><mat-icon>add</mat-icon> {{ 'vacations.newRequest' | transloco }}</button>
    </app-page-header>

    <div class="split-layout">
      <div class="split-main">
        <mat-card>
          <mat-card-content>
            <div class="filter-bar">
              <mat-form-field appearance="outline" class="search">
                <mat-icon matPrefix>search</mat-icon>
                <mat-label>{{ 'vacations.search' | transloco }}</mat-label>
                <input matInput [formControl]="searchControl" autocomplete="off" />
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:200px">
                <mat-label>{{ 'common.status' | transloco }}</mat-label>
                <mat-select [formControl]="statusFilter" (selectionChange)="applyServerFilter()">
                  <mat-option value="PENDING">{{ 'vacations.filter.pending' | transloco }}</mat-option>
                  <mat-option value="APPROVED">{{ 'vacations.filter.approved' | transloco }}</mat-option>
                  <mat-option value="REJECTED">{{ 'vacations.filter.rejected' | transloco }}</mat-option>
                  <mat-option value="">{{ 'vacations.filter.all' | transloco }}</mat-option>
                </mat-select>
              </mat-form-field>
            </div>

            @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
            @if (error()) { <p class="error-text">{{ error() }}</p> }

            <div class="table-wrap">
              <table mat-table [dataSource]="filtered()" style="width:100%">
                <ng-container matColumnDef="user">
                  <th mat-header-cell *matHeaderCellDef>{{ 'users.employee' | transloco }}</th>
                  <td mat-cell *matCellDef="let v">
                    <div class="who">
                      <span class="nm">{{ v.userName || v.userId }}</span>
                      <span class="sub">{{ v.employeeCode }}{{ v.reason ? ' · ' + v.reason : '' }}</span>
                    </div>
                  </td>
                </ng-container>
                <ng-container matColumnDef="period">
                  <th mat-header-cell *matHeaderCellDef>{{ 'vacations.period' | transloco }}</th>
                  <td mat-cell *matCellDef="let v" style="white-space:nowrap">
                    {{ v.startDate | appDate: 'dd MMM' }} – {{ v.endDate | appDate: 'dd MMM yyyy' }}
                  </td>
                </ng-container>
                <ng-container matColumnDef="days">
                  <th mat-header-cell *matHeaderCellDef style="text-align:right">{{ 'settings.vacation.days' | transloco }}</th>
                  <td mat-cell *matCellDef="let v" style="text-align:right">{{ v.days }}</td>
                </ng-container>
                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef>{{ 'common.status' | transloco }}</th>
                  <td mat-cell *matCellDef="let v"><app-status-chip [status]="v.status" /></td>
                </ng-container>
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef></th>
                  <td mat-cell *matCellDef="let v" style="text-align:right">
                    <button mat-stroked-button (click)="select(v)">
                      {{ (v.status === 'PENDING' ? 'vacations.review' : 'vacations.view') | transloco }}
                    </button>
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="columns"></tr>
                <tr mat-row *matRowDef="let row; columns: columns"
                    [style.background]="row.id === selected()?.id ? 'var(--nx-color-action-primary-subtle)' : ''"></tr>
              </table>
            </div>

            @if (!loading() && filtered().length === 0) {
              <app-empty-state icon="beach_access" [message]="'vacations.empty' | transloco" />
            }

            <mat-paginator
              [length]="total()"
              [pageSize]="size()"
              [pageIndex]="page()"
              [pageSizeOptions]="[10, 20, 50]"
              (page)="onPage($event)"
            />
          </mat-card-content>
        </mat-card>
      </div>

      @if (selected(); as v) {
        <aside class="split-drawer">
          <div class="drawer-header">
            <div class="titles">
              <h3>{{ 'vacations.request' | transloco }}</h3>
              <p class="sub">{{ v.userName || v.userId }}{{ v.employeeCode ? ' · ' + v.employeeCode : '' }}</p>
            </div>
            <button mat-icon-button (click)="closeDrawer()" [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
          </div>
          <div class="drawer-body">
            <div class="detail-section-title">{{ 'vacations.detail' | transloco }}</div>
            <div class="detail-grid">
              <div class="detail-row"><span class="k">{{ 'vacations.period' | transloco }}</span><span class="v">{{ v.startDate | appDate: 'dd MMM yyyy' }} – {{ v.endDate | appDate: 'dd MMM yyyy' }}</span></div>
              <div class="detail-row"><span class="k">{{ 'vacations.requestedDays' | transloco }}</span><span class="v">{{ v.days }}</span></div>
              @if (v.reason) {
                <div class="detail-row"><span class="k">{{ 'vacations.reason' | transloco }}</span><span class="v">{{ v.reason }}</span></div>
              }
              <div class="detail-row"><span class="k">{{ 'vacations.requestedOn' | transloco }}</span><span class="v">{{ v.createdAt | appDate: 'mediumDate' }}</span></div>
              <div class="detail-row"><span class="k">{{ 'vacations.currentStatus' | transloco }}</span><span class="v"><app-status-chip [status]="v.status" /></span></div>
              @if (v.resolvedBy) {
                <div class="detail-row"><span class="k">{{ 'vacations.resolvedBy' | transloco }}</span><span class="v">{{ v.resolvedBy }}</span></div>
              }
              @if (v.resolutionNote) {
                <div class="detail-row"><span class="k">{{ 'vacations.note' | transloco }}</span><span class="v">{{ v.resolutionNote }}</span></div>
              }
            </div>

            @if (v.status === 'PENDING') {
              <div class="detail-section-title">{{ 'vacations.resolution' | transloco }}</div>
              <form [formGroup]="resolveForm">
                <mat-form-field appearance="outline" class="drawer-field">
                  <mat-label>{{ 'vacations.noteForEmployee' | transloco }}</mat-label>
                  <textarea matInput formControlName="note" rows="3"
                    [placeholder]="'vacations.notePlaceholder' | transloco"></textarea>
                </mat-form-field>
              </form>
            }
          </div>
          @if (v.status === 'PENDING') {
            <div class="drawer-actions">
              <button mat-stroked-button color="warn" [disabled]="saving()" (click)="resolve(v, 'REJECTED')">
                <mat-icon>close</mat-icon> {{ 'vacations.reject' | transloco }}
              </button>
              <button mat-flat-button color="primary" [disabled]="saving()" (click)="resolve(v, 'APPROVED')">
                <mat-icon>check</mat-icon> {{ 'users.edit.approve' | transloco }}
              </button>
            </div>
          }
        </aside>
      }
    </div>
  `,
  styles: [
    `
      .count-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: var(--nx-radius-full); background: var(--nx-color-status-warning-bg); color: var(--nx-color-status-warning-fg); font-weight: var(--nx-font-weight-semibold); font-size: var(--nx-text-small-size); }
      .count-pill mat-icon { font-size: 18px; width: 18px; height: 18px; }
      .who { display: flex; flex-direction: column; }
      .who .nm { font-weight: var(--nx-font-weight-semibold); }
      .who .sub { font-size: var(--nx-text-small-size); color: var(--nx-color-text-secondary); }
    `,
  ],
})
export class VacationsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(VacationService);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly columns = ['user', 'period', 'days', 'status', 'actions'];
  protected readonly requests = signal<VacationRequest[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly selected = signal<VacationRequest | null>(null);

  protected readonly page = signal(0);
  protected readonly size = signal(20);
  protected readonly total = signal(0);

  protected readonly searchControl = this.fb.nonNullable.control('');
  protected readonly statusFilter = this.fb.nonNullable.control<VacationStatus | ''>('PENDING');
  protected readonly resolveForm = this.fb.nonNullable.group({ note: [''] });

  protected readonly pendingCount = computed(() => this.requests().filter((r) => r.status === 'PENDING').length);

  /** Filtro local por texto sobre lo ya cargado (el estado se filtra en el servidor). */
  protected readonly filtered = computed(() => {
    const q = this.searchControl.value.trim().toLowerCase();
    if (!q) return this.requests();
    return this.requests().filter(
      (r) =>
        (r.userName ?? '').toLowerCase().includes(q) ||
        (r.employeeCode ?? '').toLowerCase().includes(q) ||
        (r.reason ?? '').toLowerCase().includes(q),
    );
  });

  constructor() {
    this.reload();
  }

  protected openCreate(): void {
    const ref = this.dialog.open(VacationRequestDialogComponent, { width: '560px', maxWidth: '96vw', autoFocus: false });
    ref.afterClosed().subscribe((created) => {
      if (created) this.reload();
    });
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.list(this.page(), this.size(), this.statusFilter.value).subscribe({
      next: (result) => {
        this.requests.set(result.content);
        this.total.set(result.totalElements);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.transloco.translate('vacations.loadError'));
        this.loading.set(false);
      },
    });
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex);
    this.size.set(event.pageSize);
    this.reload();
  }

  protected applyServerFilter(): void {
    this.page.set(0);
    this.closeDrawer();
    this.reload();
  }

  protected select(v: VacationRequest): void {
    this.selected.set(v);
    this.resolveForm.reset({ note: '' });
  }

  protected closeDrawer(): void {
    this.selected.set(null);
  }

  protected resolve(v: VacationRequest, resolution: 'APPROVED' | 'REJECTED'): void {
    const body: ResolveVacation = { resolution, note: this.resolveForm.getRawValue().note || undefined };
    this.saving.set(true);
    this.service.resolve(v.id, body).subscribe({
      next: () => {
        this.saving.set(false);
        this.notify.success(this.transloco.translate(resolution === 'APPROVED' ? 'vacations.approved' : 'vacations.rejected'));
        this.closeDrawer();
        this.reload();
      },
      error: () => {
        this.saving.set(false);
        this.notify.error(this.transloco.translate('vacations.resolveError'));
      },
    });
  }
}
