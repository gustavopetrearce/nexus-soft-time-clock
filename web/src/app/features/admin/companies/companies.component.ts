import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthStore } from '../../../core/auth/auth.store';
import { ConfirmDialogComponent } from '../../../core/ui/confirm-dialog.component';
import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { StatusChipComponent } from '../../../core/ui/status-chip.component';
import { CapacityDialogComponent } from './capacity-dialog.component';
import { Company, TenantCapacity } from './company.models';
import { CompanyService } from './company.service';

/** Catálogo de empresas / tenants (RF-13). Alta y edición viven en páginas propias con breadcrumb. */
@Component({
  selector: 'app-companies',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatDialogModule,
    MatTooltipModule,
    PageHeaderComponent,
    StatusChipComponent,
    EmptyStateComponent,
    TranslocoPipe,
  ],
  template: `
    <app-page-header [title]="'companies.title' | transloco" [subtitle]="'companies.subtitle' | transloco">
      <button mat-flat-button color="primary" (click)="router.navigate(['/companies/new'])">
        <mat-icon>add</mat-icon> {{ 'companies.new' | transloco }}
      </button>
    </app-page-header>

    <mat-card>
      <mat-card-content>
        <div class="filter-bar">
          <mat-form-field appearance="outline" class="search">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>{{ 'companies.search' | transloco }}</mat-label>
            <input matInput [formControl]="searchControl" (keyup.enter)="applySearch()" />
          </mat-form-field>
          <button mat-stroked-button type="button" (click)="applySearch()">{{ 'common.search' | transloco }}</button>
        </div>

        @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
        @if (error()) { <p class="error-text">{{ error() }}</p> }

        <div class="table-wrap">
          <table mat-table [dataSource]="companies()" style="width:100%">
            <ng-container matColumnDef="code">
              <th mat-header-cell *matHeaderCellDef>{{ 'common.code' | transloco }}</th>
              <td mat-cell *matCellDef="let c">{{ c.code }}</td>
            </ng-container>
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>{{ 'common.name' | transloco }}</th>
              <td mat-cell *matCellDef="let c">{{ c.name }}</td>
            </ng-container>
            <ng-container matColumnDef="emailDomain">
              <th mat-header-cell *matHeaderCellDef>{{ 'companies.domain' | transloco }}</th>
              <td mat-cell *matCellDef="let c">{{ c.emailDomain || '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>{{ 'common.status' | transloco }}</th>
              <td mat-cell *matCellDef="let c"><app-status-chip [status]="c.status" /></td>
            </ng-container>
            <ng-container matColumnDef="capacity">
              <th mat-header-cell *matHeaderCellDef>{{ 'companies.capacity' | transloco }}</th>
              <td mat-cell *matCellDef="let c">
                @if (capacityOf(c.id); as cap) {
                  <span
                    class="cap"
                    [class.cap-full]="cap.available === 0"
                    [matTooltip]="capacityTooltip(cap)"
                  >
                    {{ cap.used }}/{{ cap.limit }}
                    @if (cap.extraBlocks > 0) { <span class="blk">+{{ cap.extraBlocks }}</span> }
                  </span>
                } @else {
                  <span class="cap-empty">—</span>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let c" style="text-align:right">
                @if (c.status === 'ACTIVE') {
                  <button mat-icon-button (click)="toggleStatus(c); $event.stopPropagation()" [attr.aria-label]="'common.suspend' | transloco"><mat-icon>block</mat-icon></button>
                } @else {
                  <button mat-icon-button (click)="toggleStatus(c); $event.stopPropagation()" [attr.aria-label]="'common.activate' | transloco"><mat-icon>check_circle</mat-icon></button>
                }
                @if (canManageCapacity()) {
                  <button mat-icon-button (click)="openCapacity(c); $event.stopPropagation()" [matTooltip]="'companies.manageCapacity' | transloco" [attr.aria-label]="'companies.manageCapacity' | transloco"><mat-icon>groups</mat-icon></button>
                }
                <button mat-icon-button (click)="edit(c)" [attr.aria-label]="'common.edit' | transloco"><mat-icon>chevron_right</mat-icon></button>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns" (click)="edit(row)" style="cursor:pointer"></tr>
          </table>
        </div>

        @if (!loading() && companies().length === 0) {
          <app-empty-state icon="business" [message]="'companies.empty' | transloco" />
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
  `,
  styles: [
    `
      .cap { font-variant-numeric: tabular-nums; font-weight: var(--nx-font-weight-semibold); white-space: nowrap; }
      .cap-full { color: var(--nx-color-status-warning-fg); }
      .cap .blk {
        margin-left: 6px;
        padding: 1px 7px;
        border-radius: var(--nx-radius-full);
        background: var(--nx-color-action-primary-subtle);
        color: var(--nx-color-action-primary);
        font-size: var(--nx-text-small-size);
      }
      .cap-empty { color: var(--nx-color-text-secondary); }
    `,
  ],
})
export class CompaniesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(CompanyService);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthStore);
  private readonly transloco = inject(TranslocoService);
  protected readonly router = inject(Router);

  protected readonly columns = ['code', 'name', 'emailDomain', 'status', 'capacity', 'actions'];
  protected readonly companies = signal<Company[]>([]);
  /** Cupo por empresa de la página visible, resuelto en una sola petición (RF-29). */
  protected readonly capacities = signal<Record<string, TenantCapacity>>({});
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly page = signal(0);
  protected readonly size = signal(20);
  protected readonly total = signal(0);

  protected readonly searchControl = this.fb.nonNullable.control('');

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    const search = this.searchControl.value.trim() || undefined;
    this.service.list(this.page(), this.size(), search).subscribe({
      next: (result) => {
        this.companies.set(result.content);
        this.total.set(result.totalElements);
        this.loading.set(false);
        this.loadCapacities(result.content.map((c) => c.id));
      },
      error: () => {
        this.error.set(this.transloco.translate('companies.loadError'));
        this.loading.set(false);
      },
    });
  }

  /**
   * El cupo no viaja en el listado de empresas, así que se pide aparte para toda la página. Si
   * falla, la columna queda en —: es información complementaria y no debe tumbar el listado.
   */
  private loadCapacities(ids: string[]): void {
    this.capacities.set({});
    if (!ids.length || !this.canManageCapacity()) {
      return;
    }
    this.service.getCapacities(ids).subscribe({
      next: (list) => this.capacities.set(Object.fromEntries(list.map((c) => [c.companyId, c]))),
      error: () => void 0,
    });
  }

  protected canManageCapacity(): boolean {
    return this.auth.hasPermission('company:capacity');
  }

  protected capacityOf(companyId: string): TenantCapacity | undefined {
    return this.capacities()[companyId];
  }

  protected capacityTooltip(cap: TenantCapacity): string {
    const params = { base: cap.baseLimit, blocks: cap.extraBlocks, size: cap.blockSize, available: cap.available };
    return this.transloco.translate(
      cap.available === 0 ? 'companies.capacityTooltipFull' : 'companies.capacityTooltip',
      params,
    );
  }

  protected openCapacity(company: Company): void {
    this.dialog
      .open(CapacityDialogComponent, {
        width: '520px',
        maxWidth: '96vw',
        autoFocus: false,
        data: { company, capacity: this.capacityOf(company.id) },
      })
      .afterClosed()
      .subscribe((changed) => {
        if (changed) {
          this.loadCapacities(this.companies().map((c) => c.id));
        }
      });
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex);
    this.size.set(event.pageSize);
    this.reload();
  }

  protected applySearch(): void {
    this.page.set(0);
    this.reload();
  }

  protected edit(company: Company): void {
    void this.router.navigate(['/companies', company.id, 'edit']);
  }

  protected toggleStatus(company: Company): void {
    const next = company.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: this.transloco.translate(next === 'SUSPENDED' ? 'companies.suspend' : 'companies.activate'),
          message: this.transloco.translate('companies.confirmStatus', {
            name: company.name,
            status: this.transloco.translate(`status.${next}`),
          }),
          color: next === 'SUSPENDED' ? 'warn' : 'primary',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }
        this.service.setStatus(company.id, next).subscribe({
          next: () => {
            this.notify.success(this.transloco.translate('common.statusUpdated'));
            this.reload();
          },
          error: () => this.notify.error(this.transloco.translate('common.statusError')),
        });
      });
  }
}
