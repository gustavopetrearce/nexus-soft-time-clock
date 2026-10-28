import { NgTemplateOutlet } from '@angular/common';
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
import { merge } from 'rxjs';

import { AppNumberPipe } from '../../../core/i18n/app-number.pipe';
import { PAGE_SIZE_OPTIONS, debouncedSearch, pageSizePreference } from '../../../core/ui/catalog';
import { openDrawer } from '../../../core/ui/drawer';
import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { FiltersButtonComponent } from '../../../core/ui/filters-button.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { ScrollDirective } from '../../../core/ui/scroll.directive';
import { StatusChipComponent } from '../../../core/ui/status-chip.component';
import { TenantCapacity } from '../companies/company.models';
import { CompanyService } from '../companies/company.service';
import { Role, roleLabel } from '../roles/role.models';
import { RoleService } from '../roles/role.service';
import { UserEditData, UserEditDialogComponent } from './user-edit-dialog.component';
import { UserFormData, UserFormDialogComponent } from './user-form-dialog.component';
import { USER_STATUSES, User, UserStatus } from './user.models';
import { UserService } from './user.service';

/**
 * P20 · Usuarios (RF-06, RF-22): chip de cupo (error si no queda), «Nuevo usuario», buscador de
 * nombre, apellidos o correo y filtros de código, rol y estado, todo en el servidor con espera de
 * 400 ms. Orden por correo; «Editar» abre P21 en un drawer.
 */
@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    MatTooltipModule,
    TranslocoPipe,
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
      mat-form-field { width: 100%; }
      td { white-space: nowrap; }
    `,
  ],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'users.title' | transloco" />

    <ng-template #secundarios>
      <ng-container [formGroup]="filters">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'common.code' | transloco }}</mat-label>
          <input matInput formControlName="employeeCode" placeholder="EMP-0000" autocomplete="off" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'users.role' | transloco }}</mat-label>
          <mat-select formControlName="role">
            <mat-option value="">{{ 'common.all' | transloco }}</mat-option>
            @for (r of assignableRoles(); track r.code) { <mat-option [value]="r.code">{{ label(r.code) }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'common.status' | transloco }}</mat-label>
          <mat-select formControlName="status">
            <mat-option value="">{{ 'common.all' | transloco }}</mat-option>
            @for (s of statuses; track s) { <mat-option [value]="s">{{ statusLabel(s) }}</mat-option> }
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
        <div class="nx-panel__barra">
          <div class="nx-panel__chip">
            @if (capacity(); as cap) {
              <span class="nx-chip nx-chip--{{ cap.available === 0 ? 'error' : 'informativo' }}" [matTooltip]="capacityTooltip(cap)">
                {{ 'users.capacityChip' | transloco: { used: (cap.used | appNumber), limit: (cap.limit | appNumber) } }}
              </span>
            }
          </div>
          <div class="nx-panel__acciones">
            <button mat-flat-button type="button" (click)="openCreate()"><mat-icon>add</mat-icon>{{ 'users.new' | transloco }}</button>
          </div>
        </div>

        <div class="nx-filtros" [formGroup]="filters">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-buscador">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>{{ 'users.search' | transloco }}</mat-label>
            <input matInput type="search" formControlName="search" autocomplete="off" />
          </mat-form-field>
          <div class="nx-flt-sec nx-flt-sec--grupo"><ng-container [ngTemplateOutlet]="secundarios" /></div>
          <app-filters-button [filters]="secundarios" />
        </div>

        @if (!loading() && users().length === 0) {
          @if (hasFilters()) {
            <app-empty-state icon="search" [message]="'common.noResults' | transloco">
              <button mat-button type="button" (click)="filters.reset()">{{ 'common.clearFilters' | transloco }}</button>
            </app-empty-state>
          } @else {
            <app-empty-state icon="group" [message]="'users.empty' | transloco" />
          }
        } @else {
          <div class="nx-tabla">
            <div class="nx-tabla__scroll nx-scroll" nxScroll>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{{ 'common.name' | transloco }}</th>
                    <th scope="col">{{ 'users.form.email' | transloco }}</th>
                    <th scope="col" class="nx-col-sec">{{ 'common.code' | transloco }}</th>
                    <th scope="col">{{ 'users.roles' | transloco }}</th>
                    <th scope="col">{{ 'common.status' | transloco }}</th>
                    <th scope="col" class="nx-col-acciones">{{ 'common.actions' | transloco }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (u of users(); track u.id) {
                    <tr>
                      <td><span class="nx-trunc">{{ u.firstName }} {{ u.lastName }}</span></td>
                      <td><span class="nx-trunc">{{ u.email }}</span></td>
                      <td class="nx-col-sec nx-text-code">{{ u.employeeCode || '—' }}</td>
                      <td><span class="nx-trunc">{{ rolesText(u) }}</span></td>
                      <td><app-status-chip [status]="u.status" [label]="statusLabel(u.status)" /></td>
                      <td class="nx-col-acciones">
                        <span class="nx-acciones-fila">
                          <button mat-stroked-button type="button" (click)="openEdit(u)"><mat-icon>edit</mat-icon>{{ 'common.edit' | transloco }}</button>
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
export class UsersComponent {
  private readonly service = inject(UserService);
  private readonly roleService = inject(RoleService);
  private readonly companyService = inject(CompanyService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly statuses = USER_STATUSES;
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  protected readonly users = signal<User[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);

  protected readonly page = signal(0);
  protected readonly size = pageSizePreference('users');
  protected readonly total = signal(0);

  protected readonly assignableRoles = signal<Role[]>([]);
  /** Cupo de la propia empresa, en modo lectura (RF-29): explica los rechazos por límite. */
  protected readonly capacity = signal<TenantCapacity | null>(null);

  protected readonly filters = inject(FormBuilder).nonNullable.group({
    search: '',
    employeeCode: '',
    role: '',
    status: '' as UserStatus | '',
  });

  constructor() {
    const { search, employeeCode, role, status } = this.filters.controls;
    // Texto con espera; los selectores recargan al momento. Todo vuelve a la página 1.
    merge(debouncedSearch(search.valueChanges), debouncedSearch(employeeCode.valueChanges), role.valueChanges, status.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.page.set(0);
        this.reload();
      });
    this.roleService.list().subscribe({
      next: (roles) => this.assignableRoles.set(roles),
      error: () => void 0,
    });
    this.reloadCapacity();
    this.reload();
  }

  protected hasFilters(): boolean {
    return Object.values(this.filters.getRawValue()).some((v) => !!v?.trim());
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
    return this.transloco.translate(cap.available === 0 ? 'users.capacityTooltipFull' : 'users.capacityTooltip', params);
  }

  protected label(code: string): string {
    return roleLabel(code);
  }

  protected rolesText(u: User): string {
    return u.roles.length ? u.roles.map(roleLabel).join(' · ') : '—';
  }

  protected statusLabel(code: string): string {
    return this.transloco.translate(`status.${code}`);
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(false);
    const { search, employeeCode, role, status } = this.filters.getRawValue();
    this.service
      .list(this.page(), this.size(), search.trim() || undefined, { employeeCode: employeeCode.trim(), role, status })
      .subscribe({
        next: (result) => {
          this.users.set(result.content);
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

  protected openCreate(): void {
    const ref = openDrawer<UserFormDialogComponent, UserFormData, boolean>(this.dialog, UserFormDialogComponent, {
      data: { assignableRoles: this.assignableRoles() },
      ariaLabel: this.transloco.translate('users.new'),
    });
    ref.afterClosed().subscribe((created) => {
      if (created) {
        this.reload();
        this.reloadCapacity();
      }
    });
  }

  protected openEdit(user: User): void {
    const ref = openDrawer<UserEditDialogComponent, UserEditData, boolean>(this.dialog, UserEditDialogComponent, {
      data: { user, assignableRoles: this.assignableRoles() },
      ariaLabel: this.transloco.translate('users.edit.title'),
    });
    ref.afterClosed().subscribe((changed) => {
      if (changed) {
        this.reload();
        this.reloadCapacity();
      }
    });
  }
}
