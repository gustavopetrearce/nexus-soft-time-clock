import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
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

import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { StatusChipComponent } from '../../../core/ui/status-chip.component';
import { TenantCapacity } from '../companies/company.models';
import { CompanyService } from '../companies/company.service';
import { ROLE_CODES, Role, roleLabel } from '../roles/role.models';
import { RoleService } from '../roles/role.service';
import { UserEditDialogComponent } from './user-edit-dialog.component';
import { UserFormDialogComponent } from './user-form-dialog.component';
import { USER_STATUSES, User, UserStatus } from './user.models';
import { UserService } from './user.service';

/** Administración de usuarios del tenant (RF-06, RF-22): alta/edición en modal, roles traducidos y filtros por columna. */
@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatTooltipModule,
    PageHeaderComponent,
    StatusChipComponent,
    EmptyStateComponent,
    TranslocoPipe,
  ],
  template: `
    <app-page-header [title]="'users.title' | transloco" [subtitle]="'users.subtitle' | transloco">
      @if (capacity(); as cap) {
        <span class="cap-chip" [class.cap-chip-full]="cap.available === 0" [matTooltip]="capacityTooltip(cap)">
          <mat-icon>groups</mat-icon>
          {{ 'users.capacityChip' | transloco: { used: cap.used, limit: cap.limit } }}
        </span>
      }
      <button mat-flat-button color="primary" (click)="openCreate()">
        <mat-icon>person_add</mat-icon> {{ 'users.new' | transloco }}
      </button>
    </app-page-header>

    @if (capacity()?.available === 0) {
      <p class="cap-banner">
        <mat-icon>info</mat-icon>
        {{ 'users.capacityFull' | transloco: { limit: capacity()?.limit, size: capacity()?.blockSize } }}
      </p>
    }

    <mat-card>
      <mat-card-content>
        <div class="filter-bar">
          <mat-form-field appearance="outline" class="search">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>{{ 'users.search' | transloco }}</mat-label>
            <input matInput [formControl]="searchControl" (keyup.enter)="applySearch()" />
          </mat-form-field>
          <button mat-stroked-button type="button" (click)="applySearch()">{{ 'common.search' | transloco }}</button>
          @if (hasColumnFilters()) {
            <button mat-button type="button" (click)="clearColumnFilters()"><mat-icon>filter_alt_off</mat-icon> {{ 'common.clearFilters' | transloco }}</button>
          }
        </div>

        @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
        @if (error()) { <p class="error-text">{{ error() }}</p> }

        <div class="table-wrap">
          <table mat-table [dataSource]="filtered()" class="users-table" style="width:100%">
            <!-- Colaborador: avatar + nombre + correo -->
            <ng-container matColumnDef="user">
              <th mat-header-cell *matHeaderCellDef>{{ 'users.employee' | transloco }}</th>
              <td mat-cell *matCellDef="let u">
                <div class="u-cell">
                  <div class="av" [style.background]="avatarColor(u).bg" [style.color]="avatarColor(u).fg">{{ initials(u) }}</div>
                  <div class="u-txt">
                    <div class="nm">{{ u.firstName }} {{ u.lastName }}</div>
                    <div class="sub">{{ u.email }}</div>
                  </div>
                </div>
              </td>
            </ng-container>
            <ng-container matColumnDef="employeeCode">
              <th mat-header-cell *matHeaderCellDef>{{ 'common.code' | transloco }}</th>
              <td mat-cell *matCellDef="let u"><span class="code">{{ u.employeeCode || '—' }}</span></td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>{{ 'common.status' | transloco }}</th>
              <td mat-cell *matCellDef="let u"><app-status-chip [status]="u.status" /></td>
            </ng-container>
            <ng-container matColumnDef="roles">
              <th mat-header-cell *matHeaderCellDef>{{ 'users.roles' | transloco }}</th>
              <td mat-cell *matCellDef="let u">
                @if (u.roles.length) {
                  <span class="role-tags">
                    @for (r of u.roles; track r) { <span class="role-tag">{{ label(r) }}</span> }
                  </span>
                } @else { — }
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let u" style="text-align:right;white-space:nowrap">
                <button mat-stroked-button (click)="openEdit(u); $event.stopPropagation()"><mat-icon>edit</mat-icon> {{ 'common.edit' | transloco }}</button>
              </td>
            </ng-container>

            <!-- Fila de filtros por columna (estilo Excel) -->
            <ng-container matColumnDef="user-f">
              <th mat-header-cell *matHeaderCellDef class="fcell">
                <input class="col-filter" [placeholder]="'users.filterUser' | transloco" [value]="fUser()" (input)="fUser.set(asValue($event))" />
              </th>
            </ng-container>
            <ng-container matColumnDef="employeeCode-f">
              <th mat-header-cell *matHeaderCellDef class="fcell">
                <input class="col-filter" [placeholder]="'common.filter' | transloco" [value]="fCode()" (input)="fCode.set(asValue($event))" />
              </th>
            </ng-container>
            <ng-container matColumnDef="status-f">
              <th mat-header-cell *matHeaderCellDef class="fcell">
                <select class="col-filter" [value]="fStatus()" (change)="fStatus.set(asValue($event))">
                  <option value="">{{ 'common.all' | transloco }}</option>
                  @for (s of statuses; track s) { <option [value]="s">{{ statusLabel(s) }}</option> }
                </select>
              </th>
            </ng-container>
            <ng-container matColumnDef="roles-f">
              <th mat-header-cell *matHeaderCellDef class="fcell">
                <select class="col-filter" [value]="fRole()" (change)="fRole.set(asValue($event))">
                  <option value="">{{ 'common.all' | transloco }}</option>
                  @for (r of roleCodes; track r) { <option [value]="r">{{ label(r) }}</option> }
                </select>
              </th>
            </ng-container>
            <ng-container matColumnDef="actions-f">
              <th mat-header-cell *matHeaderCellDef class="fcell"></th>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-header-row *matHeaderRowDef="filterColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns" (click)="openEdit(row)" class="urow"></tr>
          </table>
        </div>

        @if (!loading() && filtered().length === 0) {
          <app-empty-state icon="group" [message]="'users.empty' | transloco" />
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
      .users-table { border-collapse: separate; }
      .urow { cursor: pointer; transition: background 0.12s ease; }
      .urow:hover { background: var(--surface-2); }
      .users-table td.mat-mdc-cell { padding-top: 10px; padding-bottom: 10px; }

      .u-cell { display: flex; align-items: center; gap: 12px; }
      .u-cell .av {
        width: 38px; height: 38px; border-radius: 50%; flex: none;
        display: grid; place-items: center; font-weight: 700; font-size: 0.78rem;
        background: var(--brand-soft); color: var(--brand); border: none;
      }
      .u-cell .u-txt { min-width: 0; }
      .u-cell .nm { font-weight: 600; color: var(--text); line-height: 1.2; }
      .u-cell .sub { font-size: var(--font-small); color: var(--text-muted); line-height: 1.3; }

      .code { font-variant-numeric: tabular-nums; color: var(--text-muted); font-weight: 600; }

      .role-tags { display: inline-flex; flex-wrap: wrap; gap: 6px; }
      .role-tag { background: var(--brand-soft); border: 1px solid var(--brand-border); color: var(--brand); border-radius: 999px; padding: 2px 10px; font-size: var(--font-small); font-weight: 600; white-space: nowrap; }

      .cap-chip {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 12px; border-radius: 999px;
        background: var(--brand-soft); border: 1px solid var(--brand-border); color: var(--brand);
        font-size: var(--font-small); font-weight: 600; font-variant-numeric: tabular-nums;
      }
      .cap-chip mat-icon { font-size: 18px; width: 18px; height: 18px; }
      .cap-chip-full { background: var(--warning-bg); border-color: var(--warning); color: var(--warning); }

      .cap-banner {
        display: flex; align-items: flex-start; gap: 8px;
        margin: 0 0 16px; padding: 10px 14px; border-radius: 10px;
        background: var(--warning-bg); color: var(--warning); font-size: var(--font-small);
      }
      .cap-banner mat-icon { font-size: 18px; width: 18px; height: 18px; flex: none; }

      .fcell { padding-top: 6px !important; padding-bottom: 6px !important; background: var(--surface-2); }
      .col-filter { width: 100%; min-width: 90px; padding: 7px 9px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; font-size: var(--font-small); }
      .col-filter:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
      select.col-filter { cursor: pointer; }
    `,
  ],
})
export class UsersComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(UserService);
  private readonly roleService = inject(RoleService);
  private readonly companyService = inject(CompanyService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly columns = ['user', 'employeeCode', 'status', 'roles', 'actions'];
  protected readonly filterColumns = ['user-f', 'employeeCode-f', 'status-f', 'roles-f', 'actions-f'];
  protected readonly statuses = USER_STATUSES;
  protected readonly roleCodes = ROLE_CODES;

  protected readonly users = signal<User[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly page = signal(0);
  protected readonly size = signal(20);
  protected readonly total = signal(0);

  protected readonly assignableRoles = signal<Role[]>([]);
  /** Cupo de la propia empresa, en modo lectura (RF-29): explica los rechazos por límite. */
  protected readonly capacity = signal<TenantCapacity | null>(null);
  protected readonly searchControl = this.fb.nonNullable.control('');

  // Filtros por columna (sobre la página cargada)
  protected readonly fUser = signal('');
  protected readonly fCode = signal('');
  protected readonly fStatus = signal<string>('');
  protected readonly fRole = signal<string>('');

  protected readonly hasColumnFilters = computed(
    () => !!(this.fUser() || this.fCode() || this.fStatus() || this.fRole()),
  );

  protected readonly filtered = computed(() => {
    const user = this.fUser().trim().toLowerCase();
    const code = this.fCode().trim().toLowerCase();
    const status = this.fStatus();
    const role = this.fRole();
    return this.users().filter(
      (u) =>
        (!user || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(user)) &&
        (!code || (u.employeeCode ?? '').toLowerCase().includes(code)) &&
        (!status || u.status === status) &&
        (!role || u.roles.includes(role)),
    );
  });

  constructor() {
    this.roleService.list().subscribe({
      next: (roles) => this.assignableRoles.set(roles),
      error: () => void 0,
    });
    this.reloadCapacity();
    this.reload();
  }

  /** El cupo cambia con cada alta o baja, así que se relee tras cada cambio del listado. */
  protected reloadCapacity(): void {
    this.companyService.getMyCapacity().subscribe({
      next: (capacity) => this.capacity.set(capacity),
      error: () => this.capacity.set(null),
    });
  }

  protected capacityTooltip(cap: TenantCapacity): string {
    const params = { base: cap.baseLimit, blocks: cap.extraBlocks, size: cap.blockSize, available: cap.available };
    return this.transloco.translate(
      cap.available === 0 ? 'users.capacityTooltipFull' : 'users.capacityTooltip',
      params,
    );
  }

  protected initials(u: User): string {
    const a = u.firstName?.[0] ?? '';
    const b = u.lastName?.[0] ?? '';
    return (a + b).toUpperCase() || (u.email?.[0] ?? '?').toUpperCase();
  }

  /** Paleta sobria (fondos suaves + texto) para los avatares, asignada de forma estable por usuario. */
  private readonly avatarPalette = [
    { bg: 'var(--brand-soft)', fg: 'var(--brand)' },
    { bg: 'var(--info-bg)', fg: 'var(--info)' },
    { bg: 'var(--success-bg)', fg: 'var(--success)' },
    { bg: 'var(--warning-bg)', fg: 'var(--warning)' },
    { bg: 'var(--neutral-bg)', fg: 'var(--neutral)' },
  ];

  protected avatarColor(u: User): { bg: string; fg: string } {
    const key = u.id || u.email || `${u.firstName}${u.lastName}`;
    let h = 0;
    for (let i = 0; i < key.length; i++) {
      h = (h * 31 + key.charCodeAt(i)) >>> 0;
    }
    return this.avatarPalette[h % this.avatarPalette.length];
  }

  protected label(code: string): string {
    return roleLabel(code);
  }

  protected statusLabel(code: string): string {
    return this.transloco.translate(`status.${code}`);
  }

  protected asValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected clearColumnFilters(): void {
    this.fUser.set('');
    this.fCode.set('');
    this.fStatus.set('');
    this.fRole.set('');
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    const search = this.searchControl.value.trim() || undefined;
    this.service.list(this.page(), this.size(), search).subscribe({
      next: (result) => {
        this.users.set(result.content);
        this.total.set(result.totalElements);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.transloco.translate('users.loadError'));
        this.loading.set(false);
      },
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

  protected openCreate(): void {
    const ref = this.dialog.open(UserFormDialogComponent, {
      width: '760px',
      maxWidth: '96vw',
      autoFocus: false,
      data: { assignableRoles: this.assignableRoles() },
    });
    ref.afterClosed().subscribe((created) => {
      if (created) {
        this.reload();
        this.reloadCapacity();
      }
    });
  }

  protected openEdit(user: User): void {
    const ref = this.dialog.open(UserEditDialogComponent, {
      width: '720px',
      maxWidth: '96vw',
      autoFocus: false,
      data: { user, assignableRoles: this.assignableRoles() },
    });
    ref.afterClosed().subscribe((changed) => {
      if (changed) {
        this.reload();
        this.reloadCapacity();
      }
    });
  }
}
