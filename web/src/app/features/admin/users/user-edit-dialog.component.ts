import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { forkJoin, of } from 'rxjs';

import { AppDatePipe } from '../../../core/i18n/app-date.pipe';
import { AuthStore } from '../../../core/auth/auth.store';
import { AlertComponent } from '../../../core/ui/alert.component';
import { ConfirmDialogComponent } from '../../../core/ui/confirm-dialog.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { localizedProblem } from '../../../core/ui/problem-detail';
import { ScrollDirective } from '../../../core/ui/scroll.directive';
import { Role, roleLabel } from '../roles/role.models';
import { Device } from './device.models';
import { DeviceService } from './device.service';
import { EmployeeProfile, GENDERS } from './employee-profile.models';
import { EmployeeProfileService } from './employee-profile.service';
import { USER_STATUSES, User, UserStatus } from './user.models';
import { UserService } from './user.service';

export interface UserEditData {
  user: User;
  assignableRoles: Role[];
}

/**
 * P21 · Editar usuario (drawer): perfil, estado, roles y dispositivos en un solo lugar, con la
 * misma rejilla que el alta. Nombre, correo y código son de solo lectura (los gestiona identity).
 * Guarda el perfil (PUT /users/{id}/profile) y, si cambian, estado y roles; pasar a Inactivo es
 * una baja y se confirma (S01). Los rechazos del backend (cupo, RN-34) se avisan en el drawer.
 */
@Component({
  selector: 'app-user-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    AlertComponent,
    LoadingBarComponent,
    ScrollDirective,
    AppDatePipe,
    TranslocoPipe,
  ],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3" mat-dialog-title>{{ 'users.edit.title' | transloco }}</h2>
      <button mat-icon-button type="button" (click)="close(false)" [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
    </div>

    <form [formGroup]="form" class="nx-capa__cuerpo nx-scroll" nxScroll id="editar-usuario" (ngSubmit)="submit()" aria-live="polite">
      <app-loading-bar [active]="loading()" />
      @if (problem()) { <app-alert tone="error">{{ problem() }}</app-alert> }

      <div class="nx-form__grid">
        <!-- Nombre, correo y código los gestiona identity: aquí solo se consultan. -->
        <mat-form-field appearance="outline">
          <mat-label>{{ 'common.firstName' | transloco }}</mat-label>
          <input matInput [value]="data.user.firstName" disabled />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'users.form.lastNames' | transloco }}</mat-label>
          <input matInput [value]="data.user.lastName" disabled />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'users.form.email' | transloco }}</mat-label>
          <input matInput [value]="data.user.email" disabled />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'users.form.employeeCodeOptional' | transloco }}</mat-label>
          <input matInput [value]="data.user.employeeCode || ''" disabled />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'common.status' | transloco }}</mat-label>
          <mat-select formControlName="status">
            @for (s of statuses; track s) { <mat-option [value]="s">{{ 'status.' + s | transloco }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'users.roles' | transloco }}</mat-label>
          <mat-select [value]="roles()" (selectionChange)="roles.set($event.value)" multiple>
            @for (role of data.assignableRoles; track role.code) {
              <mat-option [value]="role.code">{{ roleLabel(role.code) }}</mat-option>
            }
          </mat-select>
          @if (data.assignableRoles.length === 0) { <mat-hint>{{ 'users.edit.noAssignableRoles' | transloco }}</mat-hint> }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'users.form.birth' | transloco }}</mat-label>
          <input matInput type="date" formControlName="birthDate" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'users.form.hire' | transloco }}</mat-label>
          <input matInput type="date" formControlName="hireDate" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'profile.gender' | transloco }}</mat-label>
          <mat-select formControlName="gender" [placeholder]="'users.form.select' | transloco">
            <mat-option [value]="''">{{ 'profile.unspecified' | transloco }}</mat-option>
            @for (g of genders; track g) { <mat-option [value]="g">{{ 'gender.' + g | transloco }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'profile.phone' | transloco }}</mat-label>
          <input matInput type="tel" formControlName="phone" autocomplete="off" />
        </mat-form-field>
      </div>

      <mat-form-field appearance="outline">
        <mat-label>{{ 'profile.address' | transloco }}</mat-label>
        <textarea matInput rows="2" formControlName="address"></textarea>
      </mat-form-field>
      <div class="nx-form__grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'profile.emergency' | transloco }}</mat-label>
          <input matInput formControlName="emergencyContactName" autocomplete="off" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'profile.contactPhone' | transloco }}</mat-label>
          <input matInput type="tel" formControlName="emergencyContactPhone" autocomplete="off" />
        </mat-form-field>
      </div>

      <!-- Dispositivos vinculados (RF-28, RN-27): solo con device:manage. -->
      @if (canManageDevices) {
        <h3 class="nx-text-heading-4">{{ 'users.edit.devices' | transloco }}</h3>
        @if (!devicesLoading() && devices().length === 0) {
          <p class="nx-text-small nx-sec">{{ 'users.edit.noDevices' | transloco }}</p>
        } @else {
          <app-loading-bar [active]="devicesLoading()" />
          <ul class="nx-lista">
            @for (d of devices(); track d.id) {
              <li class="nx-lista__fila">
                <div class="nx-lista__texto">
                  <span>{{ d.platform === 'IOS' ? 'iOS' : 'Android' }} · {{ d.model || d.osVersion || '—' }}</span>
                  <span class="nx-lista__secundario">
                    <span class="nx-text-code">{{ d.deviceIdentifier }}</span>
                    @if (d.lastSeenAt) { · {{ 'users.edit.lastSeen' | transloco: { date: (d.lastSeenAt | appDate: 'dd/MM/yyyy HH:mm') } }} }
                  </span>
                </div>
                <div class="nx-lista__trail">
                  <span class="nx-chip nx-chip--{{ deviceTone(d.status) }}">{{ statusLabel(d.status) }}</span>
                  @if (d.status !== 'TRUSTED') {
                    <button mat-button type="button" [disabled]="devicesBusy()" (click)="approveDevice(d)">{{ 'users.edit.approve' | transloco }}</button>
                  }
                  @if (d.status !== 'BLOCKED') {
                    <button mat-button type="button" [disabled]="devicesBusy()" (click)="revokeDevice(d)">{{ 'users.edit.revoke' | transloco }}</button>
                  }
                </div>
              </li>
            }
          </ul>
        }
      }

      <!-- Restablecer contraseña: acción sensible, bajo demanda. -->
      @if (!showReset()) {
        <button mat-button type="button" class="accion" (click)="showReset.set(true)">
          <mat-icon>lock_reset</mat-icon>{{ 'users.edit.resetPassword' | transloco }}
        </button>
      } @else {
        <mat-form-field appearance="outline">
          <mat-label>{{ 'password.new' | transloco }}</mat-label>
          <input matInput [type]="showResetPw() ? 'text' : 'password'" [formControl]="resetControl" autocomplete="new-password" />
          <button mat-icon-button matSuffix type="button" (click)="showResetPw.set(!showResetPw())" [attr.aria-label]="(showResetPw() ? 'common.hide' : 'common.show') | transloco">
            <mat-icon>{{ showResetPw() ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
          <button mat-icon-button matSuffix type="button" (click)="generateResetPassword()" [attr.aria-label]="'password.generate' | transloco">
            <mat-icon>autorenew</mat-icon>
          </button>
          <mat-hint>{{ 'password.minLength' | transloco }}</mat-hint>
        </mat-form-field>
        <div class="nx-fila-botones">
          <button mat-button type="button" (click)="cancelReset()">{{ 'common.cancel' | transloco }}</button>
          <button mat-stroked-button type="button" [disabled]="resetControl.invalid || resetting()" (click)="resetPassword()">{{ 'users.edit.apply' | transloco }}</button>
        </div>
      }

      @if (data.user.status !== 'INACTIVE') {
        <button mat-button type="button" class="accion" (click)="deactivate()">{{ 'users.edit.deactivate' | transloco }}</button>
      }
    </form>

    <div class="nx-capa__pie">
      <button mat-button type="button" (click)="close(false)"><mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button type="submit" form="editar-usuario" [disabled]="saving()" [attr.aria-busy]="saving()">
        @if (saving()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>save</mat-icon> }
        {{ 'common.save' | transloco }}
      </button>
    </div>
  `,
  styles: [
    `
      h3, ul { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      .accion { align-self: flex-start; }
      .nx-fila-botones { display: flex; justify-content: flex-end; gap: var(--nx-space-gap-inline); }
      .nx-capa__pie .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
    `,
  ],
})
export class UserEditDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly profileService = inject(EmployeeProfileService);
  private readonly deviceService = inject(DeviceService);
  private readonly auth = inject(AuthStore);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);
  private readonly dialogRef = inject(MatDialogRef<UserEditDialogComponent, boolean>);
  protected readonly data = inject<UserEditData>(MAT_DIALOG_DATA);

  protected readonly genders = GENDERS;
  protected readonly roleLabel = roleLabel;
  protected readonly statuses = USER_STATUSES;
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly roles = signal<string[]>([...this.data.user.roles]);

  // Restablecimiento de contraseña (bajo demanda, acción sensible)
  protected readonly showReset = signal(false);
  protected readonly showResetPw = signal(false);
  protected readonly resetting = signal(false);
  protected readonly resetControl = this.fb.nonNullable.control('', [Validators.required, Validators.minLength(8)]);

  // Dispositivos vinculados (RF-28). Solo se cargan/gestionan con el permiso device:manage.
  protected readonly canManageDevices = this.auth.hasPermission('device:manage');
  protected readonly devices = signal<Device[]>([]);
  protected readonly devicesLoading = signal(false);
  protected readonly devicesBusy = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    gender: [''],
    phone: [''],
    birthDate: [''],
    hireDate: [''],
    emergencyContactName: [''],
    emergencyContactPhone: [''],
    address: [''],
    status: [this.data.user.status as UserStatus],
  });

  constructor() {
    this.profileService.get(this.data.user.id).subscribe({
      next: (p) => {
        this.form.patchValue({
          gender: p.gender ?? '',
          phone: p.phone ?? '',
          birthDate: p.birthDate ?? '',
          hireDate: p.hireDate ?? '',
          emergencyContactName: p.emergencyContactName ?? '',
          emergencyContactPhone: p.emergencyContactPhone ?? '',
          address: p.address ?? '',
        });
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    if (this.canManageDevices) {
      this.loadDevices();
    }
  }

  private loadDevices(): void {
    this.devicesLoading.set(true);
    this.deviceService.listByUser(this.data.user.id).subscribe({
      next: (list) => {
        this.devices.set(list);
        this.devicesLoading.set(false);
      },
      error: () => this.devicesLoading.set(false),
    });
  }

  protected statusLabel(status: Device['status']): string {
    return this.transloco.translate(`users.edit.deviceStatus.${status}`);
  }

  protected approveDevice(device: Device): void {
    this.devicesBusy.set(true);
    this.deviceService.approve(device.id).subscribe({
      next: (updated) => {
        this.devices.update((list) => list.map((d) => (d.id === updated.id ? updated : d)));
        this.devicesBusy.set(false);
        this.notify.success(this.transloco.translate('users.edit.deviceApproved'));
      },
      error: () => {
        this.devicesBusy.set(false);
        this.notify.error(this.transloco.translate('users.edit.deviceApproveError'));
      },
    });
  }

  protected revokeDevice(device: Device): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: this.transloco.translate('users.edit.revokeTitle'),
          message: this.transloco.translate('users.edit.revokeMessage'),
          color: 'warn',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.devicesBusy.set(true);
        this.deviceService.revoke(device.id).subscribe({
          next: (updated) => {
            this.devices.update((list) => list.map((d) => (d.id === updated.id ? updated : d)));
            this.devicesBusy.set(false);
            this.notify.success(this.transloco.translate('users.edit.deviceRevoked'));
          },
          error: () => {
            this.devicesBusy.set(false);
            this.notify.error(this.transloco.translate('users.edit.deviceRevokeError'));
          },
        });
      });
  }

  protected deviceTone(status: Device['status']): 'success' | 'warning' | 'error' {
    return status === 'TRUSTED' ? 'success' : status === 'PENDING' ? 'warning' : 'error';
  }

  /** «Dar de baja» = estado Inactivo; se confirma en el guardado (S01). */
  protected deactivate(): void {
    this.form.controls.status.setValue('INACTIVE');
    this.submit();
  }

  protected close(result: boolean): void {
    this.dialogRef.close(result);
  }

  protected generateResetPassword(): void {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#%';
    let pw = '';
    const rnd = new Uint32Array(14);
    crypto.getRandomValues(rnd);
    for (const n of rnd) pw += chars[n % chars.length];
    this.resetControl.setValue(pw);
    this.showResetPw.set(true);
  }

  protected cancelReset(): void {
    this.resetControl.reset('');
    this.showReset.set(false);
    this.showResetPw.set(false);
  }

  protected resetPassword(): void {
    if (this.resetControl.invalid) return;
    const name = `${this.data.user.firstName} ${this.data.user.lastName}`.trim();
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: this.transloco.translate('users.edit.resetPassword'),
          message: this.transloco.translate('users.edit.resetMessage', { name }),
          color: 'warn',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.resetting.set(true);
        this.userService.resetPassword(this.data.user.id, this.resetControl.value).subscribe({
          next: () => {
            this.resetting.set(false);
            this.notify.success(this.transloco.translate('users.edit.passwordReset'));
            this.cancelReset();
          },
          error: () => {
            this.resetting.set(false);
            this.notify.error(this.transloco.translate('users.edit.passwordResetError'));
          },
        });
      });
  }

  protected submit(): void {
    const raw = this.form.getRawValue();
    if (raw.status === 'INACTIVE' && this.data.user.status !== 'INACTIVE') {
      const name = `${this.data.user.firstName} ${this.data.user.lastName}`.trim();
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            title: this.transloco.translate('users.edit.deactivateTitle', { name }),
            message: this.transloco.translate('users.edit.deactivateMessage'),
            confirmText: this.transloco.translate('users.edit.deactivate'),
            color: 'warn',
          },
        })
        .afterClosed()
        .subscribe((confirmed) => {
          if (confirmed) this.save();
          else this.form.controls.status.setValue(this.data.user.status);
        });
      return;
    }
    this.save();
  }

  private save(): void {
    const raw = this.form.getRawValue();
    const profile: EmployeeProfile = {
      birthDate: raw.birthDate || undefined,
      hireDate: raw.hireDate || undefined,
      gender: (raw.gender as EmployeeProfile['gender']) || undefined,
      phone: raw.phone || undefined,
      address: raw.address || undefined,
      emergencyContactName: raw.emergencyContactName || undefined,
      emergencyContactPhone: raw.emergencyContactPhone || undefined,
    };

    const ops = [this.profileService.save(this.data.user.id, profile)];
    if (raw.status !== this.data.user.status) {
      ops.push(this.userService.updateStatus(this.data.user.id, raw.status) as never);
    }
    if (!sameSet(this.roles(), this.data.user.roles)) {
      ops.push(this.userService.assignRoles(this.data.user.id, this.roles()) as never);
    }

    this.saving.set(true);
    this.problem.set(null);
    forkJoin(ops.length ? ops : [of(null)]).subscribe({
      next: () => {
        this.saving.set(false);
        this.notify.success(this.transloco.translate('users.edit.updated'));
        this.close(true);
      },
      error: (err) => {
        this.saving.set(false);
        // Reactivar o dar el rol que registra asistencia puede chocar con el cupo (RN-34):
        // el detalle del backend trae límite, usados y disponibles.
        this.problem.set(localizedProblem(this.transloco, err, 'users.edit.saveError'));
      },
    });
  }
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}
