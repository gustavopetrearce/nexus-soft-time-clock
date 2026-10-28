import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, map, of, switchMap } from 'rxjs';

import { AlertComponent } from '../../../core/ui/alert.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { localizedProblem } from '../../../core/ui/problem-detail';
import { ScrollDirective } from '../../../core/ui/scroll.directive';
import { Role, roleLabel } from '../roles/role.models';
import { EmployeeProfile, GENDERS } from './employee-profile.models';
import { EmployeeProfileService } from './employee-profile.service';
import { UserService } from './user.service';

export interface UserFormData {
  assignableRoles: Role[];
}

/**
 * P21 · Nuevo usuario (drawer, RF-06 ampliado): datos de cuenta y perfil en una sola rejilla de dos
 * columnas desde breakpoint-md. Crea el usuario y, si hay datos personales, los guarda en su perfil
 * (sub-recurso). Los rechazos del backend (cupo agotado, correo duplicado) se avisan en el drawer.
 */
@Component({
  selector: 'app-user-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TranslocoPipe,
    AlertComponent,
    ScrollDirective,
  ],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3" mat-dialog-title>{{ 'users.new' | transloco }}</h2>
      <button mat-icon-button type="button" (click)="close()" [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
    </div>

    <form [formGroup]="form" class="nx-capa__cuerpo nx-scroll" nxScroll id="nuevo-usuario" (ngSubmit)="submit()" aria-live="polite">
      @if (problem()) { <app-alert tone="error">{{ problem() }}</app-alert> }

      <div class="nx-form__grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'common.firstName' | transloco }}</mat-label>
          <input matInput formControlName="firstName" required autocomplete="off" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'users.form.lastNames' | transloco }}</mat-label>
          <input matInput formControlName="lastName" required autocomplete="off" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'users.form.email' | transloco }}</mat-label>
          <input matInput type="email" formControlName="email" required autocomplete="off" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'users.form.employeeCodeOptional' | transloco }}</mat-label>
          <input matInput formControlName="employeeCode" autocomplete="off" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'users.form.password' | transloco }}</mat-label>
          <input matInput [type]="showPw() ? 'text' : 'password'" formControlName="password" required autocomplete="new-password" />
          <button mat-icon-button matSuffix type="button" (click)="showPw.set(!showPw())" [attr.aria-label]="(showPw() ? 'common.hide' : 'common.show') | transloco">
            <mat-icon>{{ showPw() ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
          <button mat-icon-button matSuffix type="button" (click)="generatePassword()" [attr.aria-label]="'password.generate' | transloco">
            <mat-icon>autorenew</mat-icon>
          </button>
          <mat-hint>{{ 'password.minLength' | transloco }}</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'users.roles' | transloco }}</mat-label>
          <mat-select formControlName="roleCodes" multiple>
            @for (role of data.assignableRoles; track role.code) {
              <mat-option [value]="role.code">{{ roleLabel(role.code) }}</mat-option>
            }
          </mat-select>
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
    </form>

    <div class="nx-capa__pie">
      <button mat-button type="button" (click)="close()"><mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button type="submit" form="nuevo-usuario" [disabled]="saving()" [attr.aria-busy]="saving()">
        @if (saving()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>save</mat-icon> }
        {{ 'common.save' | transloco }}
      </button>
    </div>
  `,
  styles: [
    `
      mat-form-field { width: 100%; }
      .nx-capa__pie .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
    `,
  ],
})
export class UserFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly profileService = inject(EmployeeProfileService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly dialogRef = inject(MatDialogRef<UserFormDialogComponent, boolean>);
  protected readonly data = inject<UserFormData>(MAT_DIALOG_DATA);

  protected readonly genders = GENDERS;
  protected readonly roleLabel = roleLabel;
  protected readonly showPw = signal(false);
  protected readonly saving = signal(false);
  /** Motivo del rechazo del backend (CAPACITY_EXCEEDED, DUPLICATE_EMAIL…), visible en un aviso. */
  protected readonly problem = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    // personales
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]],
    employeeCode: [''],
    gender: [''],
    birthDate: [''],
    phone: [''],
    // empresa
    hireDate: [''],
    emergencyContactName: [''],
    emergencyContactPhone: [''],
    address: [''],
    // cuenta
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    roleCodes: [[] as string[]],
  });

  protected close(): void {
    this.dialogRef.close(false);
  }

  protected generatePassword(): void {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#%';
    let pw = '';
    const rnd = new Uint32Array(14);
    crypto.getRandomValues(rnd);
    for (const n of rnd) pw += chars[n % chars.length];
    this.form.controls.password.setValue(pw);
    this.showPw.set(true);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.problem.set(null);

    this.userService
      .create({
        email: raw.email,
        firstName: raw.firstName,
        lastName: raw.lastName,
        employeeCode: raw.employeeCode || undefined,
        password: raw.password,
        roleCodes: raw.roleCodes.length ? raw.roleCodes : undefined,
      })
      .pipe(
        switchMap((user) => {
          const profile = this.buildProfile();
          if (!profile) return of(true);
          // El usuario ya existe; si el perfil falla no revienta el alta, solo avisa.
          return this.profileService.save(user.id, profile).pipe(
            map(() => true),
            catchError(() => {
              this.notify.error(this.transloco.translate('users.form.createdNoProfile'));
              return of(true);
            }),
          );
        }),
      )
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notify.success(this.transloco.translate('users.form.created'));
          this.dialogRef.close(true);
        },
        error: (err) => {
          this.saving.set(false);
          // El backend explica el motivo con números —cupo agotado, correo duplicado— y ese
          // mensaje es el útil: un "no se pudo crear" genérico deja a quien administra a ciegas.
          this.problem.set(localizedProblem(this.transloco, err, 'users.form.createError'));
        },
      });
  }

  /** Construye el perfil solo con los campos informados; null si no hay ninguno. */
  private buildProfile(): EmployeeProfile | null {
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
    return Object.values(profile).some((v) => v !== undefined) ? profile : null;
  }
}
