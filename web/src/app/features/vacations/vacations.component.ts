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
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

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
import { VacationRequest, VacationResolution, VacationStatus } from './vacation.models';
import { VacationService } from './vacation.service';
import { VacationRequestDialogComponent } from './vacation-request-dialog.component';

const STATUSES: readonly (VacationStatus | '')[] = ['PENDING', 'APPROVED', 'REJECTED', ''];

/**
 * P19 · Bandeja de vacaciones (portal): buscador de colaborador (en el servidor, con espera de
 * 400 ms) y estado (pendientes por defecto); Aprobar y Rechazar en la propia fila, sin confirmación.
 * Si otra persona ya la resolvió (409) se avisa arriba del listado y se recarga.
 */
@Component({
  selector: 'app-vacations',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
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
      td.motivo .nx-trunc { max-width: calc(var(--nx-space-16) * 4); }
    `,
  ],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'layout.nav.vacations' | transloco">
      @if (canRequest()) {
        <button mat-stroked-button type="button" (click)="openCreate()"><mat-icon>add</mat-icon>{{ 'vacations.newRequest' | transloco }}</button>
      }
    </app-page-header>

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
        <button mat-stroked-button type="button" (click)="reload()">{{ 'common.retry' | transloco }}</button>
      </app-empty-state>
    } @else {
      <section class="nx-panel nx-panel--listado">
        <div class="nx-filtros">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-buscador">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>{{ 'vacations.search' | transloco }}</mat-label>
            <input matInput type="search" [formControl]="searchControl" autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'common.status' | transloco }}</mat-label>
            <mat-select [formControl]="statusFilter" (selectionChange)="applyServerFilter()">
              @for (s of statuses; track s) { <mat-option [value]="s">{{ 'vacations.filter.' + (s || 'all').toLowerCase() | transloco }}</mat-option> }
            </mat-select>
          </mat-form-field>
        </div>

        @if (alreadyResolved()) {
          <app-alert tone="error">{{ 'vacations.alreadyResolved' | transloco }}</app-alert>
        }

        @if (!loading() && requests().length === 0) {
          @if (searchControl.value.trim() || statusFilter.value !== 'PENDING') {
            <app-empty-state icon="search" [message]="'common.noResults' | transloco">
              <button mat-button type="button" (click)="clearFilters()">{{ 'common.clearFilters' | transloco }}</button>
            </app-empty-state>
          } @else {
            <app-empty-state icon="beach_access" [message]="'vacations.empty' | transloco" />
          }
        } @else {
          <div class="nx-tabla">
            <div class="nx-tabla__scroll nx-scroll" nxScroll>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{{ 'vacations.collaborator' | transloco }}</th>
                    <th scope="col" class="num">{{ 'vacations.start' | transloco }}</th>
                    <th scope="col" class="num">{{ 'vacations.end' | transloco }}</th>
                    <th scope="col" class="num">{{ 'vacations.days' | transloco }}</th>
                    <th scope="col" class="nx-col-sec">{{ 'vacations.reason' | transloco }}</th>
                    <th scope="col">{{ 'common.status' | transloco }}</th>
                    <th scope="col" class="nx-col-acciones">{{ 'common.actions' | transloco }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (v of requests(); track v.id) {
                    <tr>
                      <td><span class="nx-trunc">{{ v.userName || v.userId }}</span></td>
                      <td class="num nx-text-numeric">{{ v.startDate | appDate: 'dd/MM/yyyy' }}</td>
                      <td class="num nx-text-numeric">{{ v.endDate | appDate: 'dd/MM/yyyy' }}</td>
                      <td class="num nx-text-numeric">{{ v.days | appNumber }}</td>
                      <td class="nx-col-sec motivo"><span class="nx-trunc" [attr.title]="v.reason || null">{{ v.reason || '—' }}</span></td>
                      <td><app-status-chip [status]="v.status" [label]="'vacations.status.' + v.status | transloco" /></td>
                      <td class="nx-col-acciones">
                        @if (v.status === 'PENDING') {
                          <span class="nx-acciones-fila">
                            <button mat-stroked-button type="button" [disabled]="savingId() === v.id" (click)="resolve(v, 'REJECTED')">
                              {{ 'vacations.reject' | transloco }}
                            </button>
                            <button mat-flat-button type="button" [disabled]="savingId() === v.id" (click)="resolve(v, 'APPROVED')">
                              {{ 'vacations.approve' | transloco }}
                            </button>
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
export class VacationsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(VacationService);
  private readonly store = inject(AuthStore);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly statuses = STATUSES;
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  protected readonly requests = signal<VacationRequest[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly savingId = signal<string | null>(null);
  protected readonly alreadyResolved = signal(false);

  protected readonly page = signal(0);
  protected readonly size = pageSizePreference('vacations');
  protected readonly total = signal(0);

  protected readonly searchControl = this.fb.nonNullable.control('');
  protected readonly statusFilter = this.fb.nonNullable.control<VacationStatus | ''>('PENDING');

  constructor() {
    debouncedSearch(this.searchControl.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.applyServerFilter());
    this.reload();
  }

  protected canRequest(): boolean {
    return this.store.hasPermission('vacation:request');
  }

  protected openCreate(): void {
    const ref = this.dialog.open(VacationRequestDialogComponent);
    ref.afterClosed().subscribe((created) => {
      if (created) this.reload();
    });
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(false);
    const search = this.searchControl.value.trim() || undefined;
    this.service.list(this.page(), this.size(), this.statusFilter.value, search).subscribe({
      next: (result) => {
        this.requests.set(result.content);
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

  protected applyServerFilter(): void {
    this.page.set(0);
    this.alreadyResolved.set(false);
    this.reload();
  }

  protected clearFilters(): void {
    this.searchControl.setValue('', { emitEvent: false });
    this.statusFilter.setValue('PENDING');
    this.applyServerFilter();
  }

  /** Sin confirmación (HIFI/08 R3): la decisión se toma desde la fila. */
  protected resolve(v: VacationRequest, resolution: VacationResolution): void {
    this.savingId.set(v.id);
    this.alreadyResolved.set(false);
    this.service.resolve(v.id, { resolution }).subscribe({
      next: () => {
        this.savingId.set(null);
        this.notify.success(this.transloco.translate(resolution === 'APPROVED' ? 'vacations.approved' : 'vacations.rejected'));
        this.reload();
      },
      error: (err: unknown) => {
        this.savingId.set(null);
        if (err instanceof HttpErrorResponse && err.status === 409) {
          this.alreadyResolved.set(true);
          this.reload();
        } else {
          this.notify.error(this.transloco.translate('vacations.resolveError'));
        }
      },
    });
  }
}
