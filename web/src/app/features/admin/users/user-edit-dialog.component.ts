import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { forkJoin, of } from 'rxjs';

import { AppDatePipe } from '../../../core/i18n/app-date.pipe';
import { AuthStore } from '../../../core/auth/auth.store';
import { ConfirmDialogComponent } from '../../../core/ui/confirm-dialog.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { localizedProblem } from '../../../core/ui/problem-detail';
import { StatusChipComponent } from '../../../core/ui/status-chip.component';
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
 * Edición de usuario en modal: datos personales (perfil), estado y roles en un solo lugar,
 * consistente con el alta. Nombre/correo/código son de solo lectura (los gestiona identity).
 * Guarda el perfil (PUT /users/{id}/profile) y, si cambian, estado y roles.
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
    MatCheckboxModule,
    MatExpansionModule,
    MatProgressBarModule,
    StatusChipComponent,
    AppDatePipe,
    TranslocoPipe,
  ],
  template: `
    <div class="m-head">
      <div class="badge-ic">{{ initials }}</div>
      <div class="t">
        <h2>{{ data.user.firstName }} {{ data.user.lastName }}</h2>
        <p>{{ data.user.email }}<span class="sep">·</span>{{ data.user.employeeCode || ('users.edit.noCode' | transloco) }}</p>
      </div>
      <button mat-icon-button (click)="close(false)" [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
    </div>

    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }

    <form [formGroup]="form" class="m-body">
      <!-- Datos personales (perfil) -->
      <section class="fs">
        <div class="fs-head"><mat-icon>person</mat-icon><h4>{{ 'profile.personal' | transloco }}</h4><span class="opt">{{ 'users.form.optional' | transloco }}</span></div>
        <div class="grid2">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'profile.gender' | transloco }}</mat-label>
            <mat-select formControlName="gender">
              <mat-option [value]="''">{{ 'profile.unspecified' | transloco }}</mat-option>
              @for (g of genders; track g) { <mat-option [value]="g">{{ 'gender.' + g | transloco }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'profile.phone' | transloco }}</mat-label>
            <mat-icon matPrefix>call</mat-icon>
            <input matInput type="tel" formControlName="phone" placeholder="+52 55 1234 5678" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'profile.birthDate' | transloco }}</mat-label>
            <input matInput type="date" formControlName="birthDate" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'profile.hireDate' | transloco }}</mat-label>
            <input matInput type="date" formControlName="hireDate" />
            <mat-hint>{{ 'profile.hireDateHint' | transloco }}</mat-hint>
          </mat-form-field>
        </div>

        <mat-accordion class="opt-acc">
          <mat-expansion-panel [expanded]="hasEmergency()">
            <mat-expansion-panel-header>
              <mat-panel-title><mat-icon>call</mat-icon> {{ 'profile.emergency' | transloco }}</mat-panel-title>
            </mat-expansion-panel-header>
            <div class="grid2">
              <mat-form-field appearance="outline">
                <mat-label>{{ 'profile.contactName' | transloco }}</mat-label>
                <input matInput formControlName="emergencyContactName" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'profile.contactPhone' | transloco }}</mat-label>
                <mat-icon matPrefix>call</mat-icon>
                <input matInput type="tel" formControlName="emergencyContactPhone" />
              </mat-form-field>
            </div>
          </mat-expansion-panel>
          <mat-expansion-panel [expanded]="!!form.controls.address.value">
            <mat-expansion-panel-header>
              <mat-panel-title><mat-icon>place</mat-icon> {{ 'profile.address' | transloco }}</mat-panel-title>
            </mat-expansion-panel-header>
            <mat-form-field appearance="outline" class="full">
              <mat-label>{{ 'profile.address' | transloco }}</mat-label>
              <textarea matInput rows="2" formControlName="address" [placeholder]="'profile.addressPlaceholder' | transloco"></textarea>
            </mat-form-field>
          </mat-expansion-panel>
        </mat-accordion>
      </section>

      <!-- Estado -->
      <section class="fs">
        <div class="fs-head"><mat-icon>badge</mat-icon><h4>{{ 'users.edit.account' | transloco }}</h4></div>
        <div class="grid2">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'common.status' | transloco }}</mat-label>
            <mat-select formControlName="status">
              @for (s of statuses; track s) { <mat-option [value]="s">{{ 'status.' + s | transloco }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <div class="chip-cell"><app-status-chip [status]="form.controls.status.value" /></div>
        </div>

        @if (!showReset()) {
          <button mat-stroked-button type="button" (click)="showReset.set(true)">
            <mat-icon>lock_reset</mat-icon> {{ 'users.edit.resetPassword' | transloco }}
          </button>
        } @else {
          <div class="reset-block">
            <mat-form-field appearance="outline" class="full">
              <mat-label>{{ 'password.new' | transloco }}</mat-label>
              <mat-icon matPrefix>lock</mat-icon>
              <input matInput [type]="showResetPw() ? 'text' : 'password'" [formControl]="resetControl" autocomplete="new-password" />
              <button mat-icon-button matSuffix type="button" (click)="showResetPw.set(!showResetPw())" [attr.aria-label]="(showResetPw() ? 'common.hide' : 'common.show') | transloco">
                <mat-icon>{{ showResetPw() ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
              <mat-hint><a class="link" (click)="generateResetPassword()">{{ 'password.generate' | transloco }}</a> · {{ 'password.minLength' | transloco }}</mat-hint>
            </mat-form-field>
            <div class="reset-actions">
              <button mat-flat-button color="primary" type="button" [disabled]="resetControl.invalid || resetting()" (click)="resetPassword()">
                <mat-icon>check</mat-icon> {{ 'users.edit.apply' | transloco }}
              </button>
              <button mat-button type="button" (click)="cancelReset()">{{ 'common.cancel' | transloco }}</button>
            </div>
          </div>
        }
      </section>

      <!-- Roles -->
      <section class="fs">
        <div class="fs-head"><mat-icon>shield</mat-icon><h4>{{ 'users.roles' | transloco }}</h4></div>
        @if (data.assignableRoles.length === 0) {
          <p class="muted">{{ 'users.edit.noAssignableRoles' | transloco }}</p>
        }
        <div class="roles-list">
          @for (role of data.assignableRoles; track role.code) {
            <mat-checkbox [checked]="isRole(role.code)" (change)="toggleRole(role.code, $event.checked)">
              {{ roleLabel(role.code) }} <span class="muted">({{ role.code }})</span>
            </mat-checkbox>
          }
        </div>
      </section>

      <!-- Dispositivos vinculados (RF-28, RN-27) -->
      @if (canManageDevices) {
        <section class="fs">
          <div class="fs-head"><mat-icon>smartphone</mat-icon><h4>{{ 'users.edit.devices' | transloco }}</h4></div>
          @if (devicesLoading()) {
            <p class="muted">{{ 'users.edit.loadingDevices' | transloco }}</p>
          } @else if (devices().length === 0) {
            <p class="muted">{{ 'users.edit.noDevices' | transloco }}</p>
          } @else {
            <div class="dev-list">
              @for (d of devices(); track d.id) {
                <div class="dev-row">
                  <mat-icon class="dev-ic">{{ d.platform === 'IOS' ? 'phone_iphone' : 'phone_android' }}</mat-icon>
                  <div class="dev-info">
                    <span class="dev-model">{{ d.model || d.deviceIdentifier }}</span>
                    <span class="muted dev-meta">
                      {{ d.osVersion || d.platform }}
                      @if (d.lastSeenAt) { <span class="sep">·</span> {{ 'users.edit.lastSeen' | transloco: { date: (d.lastSeenAt | appDate: 'short') } }} }
                    </span>
                  </div>
                  <span class="dev-status" [class.trusted]="d.status === 'TRUSTED'" [class.pending]="d.status === 'PENDING'" [class.blocked]="d.status === 'BLOCKED'">
                    {{ statusLabel(d.status) }}
                  </span>
                  <div class="dev-actions">
                    @if (d.status !== 'TRUSTED') {
                      <button mat-stroked-button color="primary" type="button" [disabled]="devicesBusy()" (click)="approveDevice(d)">
                        <mat-icon>verified_user</mat-icon> {{ 'users.edit.approve' | transloco }}
                      </button>
                    }
                    @if (d.status !== 'BLOCKED') {
                      <button mat-stroked-button color="warn" type="button" [disabled]="devicesBusy()" (click)="revokeDevice(d)">
                        <mat-icon>block</mat-icon> {{ 'users.edit.revoke' | transloco }}
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </section>
      }
    </form>

    <div class="m-foot">
      <span class="fill"></span>
      <button mat-button (click)="close(false)">{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button color="primary" [disabled]="saving()" (click)="submit()">
        <mat-icon>save</mat-icon> {{ 'common.saveChanges' | transloco }}
      </button>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .m-head { display: flex; align-items: center; gap: 14px; padding: 20px 28px 16px; border-bottom: 1px solid var(--nx-color-border-default); }
      .m-head .badge-ic { width: 44px; height: 44px; border-radius: var(--nx-radius-full); background: var(--nx-color-action-primary-subtle); color: var(--nx-color-action-primary); display: grid; place-items: center; border: 1px solid var(--nx-color-border-brand); flex: none; font-weight: var(--nx-font-weight-bold); }
      .m-head .t { flex: 1; }
      .m-head h2 { margin: 0; font-size: 1.15rem; font-weight: var(--nx-font-weight-bold); }
      .m-head p { margin: 2px 0 0; color: var(--nx-color-text-secondary); font-size: var(--nx-text-small-size); }
      .m-head .sep { margin: 0 6px; }
      .m-body { padding: 8px 28px 12px; max-height: 60vh; overflow-y: auto; }
      .fs { padding: 16px 0; }
      .fs + .fs { border-top: 1px solid var(--nx-color-border-default); }
      .fs-head { display: flex; align-items: center; gap: 9px; margin-bottom: 12px; }
      .fs-head mat-icon { color: var(--nx-color-action-primary); }
      .fs-head h4 { margin: 0; font-size: var(--nx-text-body-size); font-weight: var(--nx-font-weight-bold); }
      .fs-head .opt { margin-left: 4px; font-size: var(--nx-text-caption-size); font-weight: var(--nx-font-weight-bold); text-transform: uppercase; letter-spacing: .05em; color: var(--nx-color-text-disabled); border: 1px solid var(--nx-color-border-default); border-radius: var(--nx-radius-full); padding: 2px 8px; }
      .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 var(--nx-space-4); align-items: center; }
      .grid2 .full { grid-column: 1 / -1; }
      mat-form-field { width: 100%; }
      .chip-cell { display: flex; align-items: center; }
      .opt-acc { margin-top: 6px; display: block; }
      .roles-list { display: flex; flex-direction: column; gap: var(--nx-space-2); }
      .reset-block { margin-top: var(--nx-space-3); }
      .reset-block .full { width: 100%; }
      .reset-actions { display: flex; gap: var(--nx-space-2); }
      .dev-list { display: flex; flex-direction: column; gap: var(--nx-space-2); }
      .dev-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--nx-color-border-default); border-radius: 10px; }
      .dev-row .dev-ic { color: var(--nx-color-action-primary); flex: none; }
      .dev-info { display: flex; flex-direction: column; min-width: 0; flex: 1; }
      .dev-model { font-weight: var(--nx-font-weight-semibold); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dev-meta { font-size: var(--nx-text-caption-size); }
      .dev-meta .sep { margin: 0 5px; }
      .dev-status { font-size: var(--nx-text-caption-size); font-weight: var(--nx-font-weight-bold); text-transform: uppercase; letter-spacing: .04em; border-radius: var(--nx-radius-full); padding: 3px 9px; border: 1px solid var(--nx-color-border-default); color: var(--nx-color-text-disabled); flex: none; }
      .dev-status.trusted { color: var(--nx-color-status-success-fg); border-color: var(--nx-color-status-success-fg); }
      .dev-status.pending { color: var(--nx-color-status-warning-fg); border-color: var(--nx-color-status-warning-fg); }
      .dev-status.blocked { color: var(--nx-color-status-error-fg); border-color: var(--nx-color-status-error-fg); }
      .dev-actions { display: flex; gap: var(--nx-space-2); flex: none; }
      .link { color: var(--nx-color-action-primary); cursor: pointer; font-weight: var(--nx-font-weight-semibold); }
      .m-foot { display: flex; align-items: center; gap: 10px; padding: 14px 28px 18px; border-top: 1px solid var(--nx-color-border-default); }
      .m-foot .fill { flex: 1; }
      @media (max-width: 640px) { .grid2 { grid-template-columns: 1fr; } }
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

  get initials(): string {
    const f = this.data.user.firstName?.[0] ?? '';
    const l = this.data.user.lastName?.[0] ?? '';
    return (f + l).toUpperCase() || '?';
  }

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

  protected hasEmergency(): boolean {
    const v = this.form.controls;
    return !!(v.emergencyContactName.value || v.emergencyContactPhone.value);
  }

  protected isRole(code: string): boolean {
    return this.roles().includes(code);
  }

  protected toggleRole(code: string, checked: boolean): void {
    this.roles.update((list) => (checked ? [...new Set([...list, code])] : list.filter((c) => c !== code)));
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
        this.notify.error(localizedProblem(this.transloco, err, 'users.edit.saveError'));
      },
    });
  }
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}
