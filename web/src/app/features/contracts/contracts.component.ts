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
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { debounceTime, merge } from 'rxjs';

import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { AlertComponent } from '../../core/ui/alert.component';
import { PAGE_SIZE_OPTIONS, debouncedSearch, pageSizePreference } from '../../core/ui/catalog';
import { EmptyStateComponent } from '../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../core/ui/loading-bar.component';
import { NotificationService } from '../../core/ui/notification.service';
import { PageHeaderComponent } from '../../core/ui/page-header.component';
import { ScrollDirective } from '../../core/ui/scroll.directive';
import { StatusChipComponent } from '../../core/ui/status-chip.component';
import { ContractAction, ContractActionDialogComponent, ContractActionMode } from './contract-action-dialog.component';
import { ContractDialogComponent, ContractDialogData } from './contract-dialog.component';
import { openDrawer } from '../../core/ui/drawer';
import {
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  Contract,
  ContractOptions,
  ContractStatus,
  ContractType,
  contractPhase,
  hrErrorMessage,
  isoToday,
} from './contract.models';
import { ContractService } from './contract.service';

/**
 * Contratos de colaboradores (RF-30), {@code contract:manage}. Por proyecto (asignación al
 * proyecto, dentro de su vigencia) o por turno (periodo de empleo). Filtros en el servidor:
 * búsqueda (400 ms), tipo, estado, proyecto y "vigente en" una fecha. Los contratos por proyecto
 * que ya no caben en el proyecto, o cuyo proyecto se cerró, se señalan "por revisar" (RN-65).
 */
@Component({
  selector: 'app-contracts',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    MatTooltipModule,
    TranslocoPipe,
    AppDatePipe,
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
      .revisar { display: inline-flex; align-items: center; gap: var(--nx-space-1); color: var(--nx-color-status-warning-fg); }
      .revisar mat-icon { font-size: 18px; width: 18px; height: 18px; }
    `,
  ],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'layout.nav.contracts' | transloco">
      <button mat-flat-button type="button" (click)="openCreate()"><mat-icon>add</mat-icon>{{ 'contracts.newContract' | transloco }}</button>
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
            <mat-label>{{ 'contracts.search' | transloco }}</mat-label>
            <input matInput type="search" formControlName="search" autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'contracts.type' | transloco }}</mat-label>
            <mat-select formControlName="type">
              <mat-option value="">{{ 'common.all' | transloco }}</mat-option>
              @for (t of types; track t) { <mat-option [value]="t">{{ 'contracts.types.' + t | transloco }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'contracts.project' | transloco }}</mat-label>
            <mat-select formControlName="projectId">
              <mat-option value="">{{ 'common.all' | transloco }}</mat-option>
              @for (p of options().projects; track p.id) { <mat-option [value]="p.id">{{ p.code }} · {{ p.name }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'common.status' | transloco }}</mat-label>
            <mat-select formControlName="status">
              <mat-option value="">{{ 'common.all' | transloco }}</mat-option>
              @for (s of statuses; track s) { <mat-option [value]="s">{{ 'contracts.status.' + s | transloco }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-campo--fecha">
            <mat-label>{{ 'contracts.activeOn' | transloco }}</mat-label>
            <input matInput type="date" formControlName="activeOn" />
          </mat-form-field>
        </div>

        @if (conflict(); as msg) {
          <app-alert tone="error">{{ msg }}</app-alert>
        }

        @if (!loading() && contracts().length === 0) {
          @if (hasFilters()) {
            <app-empty-state icon="search" [message]="'common.noResults' | transloco">
              <button mat-button type="button" (click)="clearFilters()">{{ 'common.clearFilters' | transloco }}</button>
            </app-empty-state>
          } @else {
            <app-empty-state icon="badge" [message]="'contracts.empty' | transloco" />
          }
        } @else {
          <div class="nx-tabla">
            <div class="nx-tabla__scroll nx-scroll" nxScroll>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{{ 'contracts.collaborator' | transloco }}</th>
                    <th scope="col">{{ 'contracts.type' | transloco }}</th>
                    <th scope="col">{{ 'contracts.project' | transloco }}</th>
                    <th scope="col" class="num">{{ 'contracts.period' | transloco }}</th>
                    <th scope="col">{{ 'contracts.phase.label' | transloco }}</th>
                    <th scope="col">{{ 'common.status' | transloco }}</th>
                    <th scope="col" class="nx-col-sec">{{ 'contracts.workSite' | transloco }}</th>
                    <th scope="col" class="nx-col-sec">{{ 'contracts.notes' | transloco }}</th>
                    <th scope="col" class="nx-col-acciones">{{ 'common.actions' | transloco }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of contracts(); track c.id) {
                    <tr>
                      <td>
                        <span class="nx-trunc">{{ c.userName || c.userId }}</span>
                        @if (c.employeeCode) { <span class="sub nx-sec nx-text-small">{{ c.employeeCode }}</span> }
                      </td>
                      <td>{{ 'contracts.types.' + c.type | transloco }}</td>
                      <td>
                        @if (c.projectId) {
                          <span class="nx-trunc">{{ c.projectCode }} · {{ c.projectName }}</span>
                          @if (c.needsReview) {
                            <span class="sub revisar nx-text-small" [matTooltip]="'contracts.needsReviewHint' | transloco">
                              <mat-icon>warning</mat-icon>{{ 'contracts.needsReview' | transloco }}
                            </span>
                          }
                        } @else { — }
                      </td>
                      <td class="num nx-text-numeric">
                        {{ c.startsOn | appDate: 'dd/MM/yyyy' }} –
                        {{ c.endsOn ? (c.endsOn | appDate: 'dd/MM/yyyy') : ('contracts.indefinite' | transloco) }}
                      </td>
                      <td>
                        @if (phase(c); as ph) { {{ 'contracts.phase.' + ph | transloco }} } @else { — }
                      </td>
                      <td>
                        <app-status-chip [status]="c.status" [label]="'contracts.status.' + c.status | transloco"
                          [matTooltip]="statusTooltip(c)" />
                      </td>
                      <td class="nx-col-sec"><span class="nx-trunc">{{ siteName(c.workSiteId) }}</span></td>
                      <td class="nx-col-sec notas"><span class="nx-trunc" [attr.title]="c.notes || null">{{ c.notes || '—' }}</span></td>
                      <td class="nx-col-acciones">
                        <span class="nx-acciones-fila">
                          @if (c.status === 'ACTIVE') {
                            <button mat-stroked-button type="button" [disabled]="savingId() === c.id" (click)="openEdit(c)">
                              <mat-icon>edit</mat-icon>{{ 'common.edit' | transloco }}
                            </button>
                            <button mat-button type="button" [disabled]="savingId() === c.id" (click)="act(c, 'end')">
                              {{ 'contracts.endAction' | transloco }}
                            </button>
                          }
                          @if (c.status !== 'CANCELLED') {
                            <button mat-button type="button" [disabled]="savingId() === c.id" (click)="act(c, 'cancel')">
                              {{ 'contracts.cancelAction' | transloco }}
                            </button>
                          }
                        </span>
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
export class ContractsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ContractService);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly types = CONTRACT_TYPES;
  protected readonly statuses = CONTRACT_STATUSES;
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  private readonly today = isoToday();

  protected readonly contracts = signal<Contract[]>([]);
  protected readonly options = signal<ContractOptions>({ collaborators: [], projects: [], workSites: [] });
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly savingId = signal<string | null>(null);
  protected readonly conflict = signal<string | null>(null);

  protected readonly page = signal(0);
  protected readonly size = pageSizePreference('contracts');
  protected readonly total = signal(0);

  protected readonly filters = this.fb.nonNullable.group({
    search: [''],
    type: ['' as ContractType | ''],
    projectId: [''],
    status: ['' as ContractStatus | ''],
    activeOn: [''],
  });

  constructor() {
    const c = this.filters.controls;
    merge(
      debouncedSearch(c.search.valueChanges),
      c.type.valueChanges,
      c.projectId.valueChanges,
      c.status.valueChanges,
      c.activeOn.valueChanges.pipe(debounceTime(400)),
    )
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.applyFilter());
    this.service.options().subscribe({ next: (o) => this.options.set(o), error: () => void 0 });
    this.reload();
  }

  protected phase(c: Contract) {
    return contractPhase(c, this.today);
  }

  protected siteName(id?: string): string {
    if (!id) return '—';
    return this.options().workSites.find((w) => w.id === id)?.name ?? '—';
  }

  protected statusTooltip(c: Contract): string {
    if (c.status === 'CANCELLED') return [c.cancelledByName, c.cancelReason].filter(Boolean).join(' — ');
    if (c.status === 'ENDED') return c.endedByName ?? '';
    return c.createdByName ? `${this.transloco.translate('contracts.createdBy')}: ${c.createdByName}` : '';
  }

  protected hasFilters(): boolean {
    return Object.values(this.filters.getRawValue()).some((v) => !!String(v).trim());
  }

  protected openCreate(): void {
    this.openDialog({});
  }

  protected openEdit(contract: Contract): void {
    this.openDialog({ contract });
  }

  private openDialog(data: ContractDialogData): void {
    openDrawer(this.dialog, ContractDialogComponent, {
      data,
      ariaLabel: this.transloco.translate(data.contract ? 'contracts.dialog.editTitle' : 'contracts.dialog.title'),
    })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.reload();
      });
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(false);
    const f = this.filters.getRawValue();
    this.service.list(this.page(), this.size(), { ...f, search: f.search.trim() || undefined }).subscribe({
      next: (result) => {
        this.contracts.set(result.content);
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
    this.conflict.set(null);
    this.reload();
  }

  protected clearFilters(): void {
    this.filters.reset({}, { emitEvent: false });
    this.applyFilter();
  }

  protected act(c: Contract, mode: ContractActionMode): void {
    this.dialog
      .open<ContractActionDialogComponent, unknown, ContractAction>(ContractActionDialogComponent, {
        data: { mode, contract: c },
        width: '480px',
        maxWidth: '96vw',
      })
      .afterClosed()
      .subscribe((action) => {
        if (!action) return;
        this.savingId.set(c.id);
        this.conflict.set(null);
        const call =
          mode === 'end' && action.endDate
            ? this.service.end(c.id, action.endDate)
            : this.service.cancel(c.id, action.reason ?? '');
        call.subscribe({
          next: () => {
            this.savingId.set(null);
            this.notify.success(this.transloco.translate(mode === 'end' ? 'contracts.ended' : 'contracts.cancelled'));
            this.reload();
          },
          error: (err: unknown) => {
            this.savingId.set(null);
            if (err instanceof HttpErrorResponse && err.status === 409) {
              this.conflict.set(hrErrorMessage(err) ?? this.transloco.translate('contracts.actionError'));
              this.reload();
            } else {
              this.notify.error(hrErrorMessage(err) ?? this.transloco.translate('contracts.actionError'));
            }
          },
        });
      });
  }
}
