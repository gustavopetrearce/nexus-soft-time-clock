import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, map, of, switchMap } from 'rxjs';

import { NotificationService } from '../../../core/ui/notification.service';
import { localizedProblem } from '../../../core/ui/problem-detail';
import { Role, roleLabel } from '../roles/role.models';
import { EmployeeProfile, GENDERS } from './employee-profile.models';
import { EmployeeProfileService } from './employee-profile.service';
import { UserService } from './user.service';

export interface UserFormData {
  assignableRoles: Role[];
}

/**
 * Alta de usuario con perfil (RF-06 ampliado). Modal seccionado: datos personales →
 * datos de empresa → cuenta y acceso, con contacto de emergencia y dirección como
 * paneles opcionales (revelado progresivo). Crea el usuario y, si hay datos personales,
 * los guarda en su perfil (sub‑recurso), sin acoplarse al módulo identity.
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
    MatExpansionModule,
    TranslocoPipe,
  ],
  template: `
    <div class="m-head">
      <div class="badge-ic"><mat-icon>person_add</mat-icon></div>
      <div class="t">
        <h2>{{ 'users.new' | transloco }}</h2>
        <p>{{ 'users.form.subtitle' | transloco }}</p>
      </div>
      <button mat-icon-button (click)="close()" [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
    </div>

    <form [formGroup]="form" class="m-body">
      <!-- 1) Datos personales -->
      <section class="fs">
        <div class="fs-head"><mat-icon>person</mat-icon><h4>{{ 'profile.personal' | transloco }}</h4><span class="opt">{{ 'users.form.optionalExceptRequired' | transloco }}</span></div>
        <div class="grid2">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'common.firstName' | transloco }} *</mat-label>
            <input matInput formControlName="firstName" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'common.lastName' | transloco }} *</mat-label>
            <input matInput formControlName="lastName" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'common.employeeCode' | transloco }}</mat-label>
            <mat-icon matPrefix>badge</mat-icon>
            <input matInput formControlName="employeeCode" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'profile.gender' | transloco }}</mat-label>
            <mat-select formControlName="gender">
              <mat-option [value]="''">{{ 'profile.unspecified' | transloco }}</mat-option>
              @for (g of genders; track g) { <mat-option [value]="g">{{ 'gender.' + g | transloco }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'profile.birthDate' | transloco }}</mat-label>
            <input matInput type="date" formControlName="birthDate" />
            <mat-hint>{{ 'users.form.birthDateHint' | transloco }}</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'profile.phone' | transloco }}</mat-label>
            <mat-icon matPrefix>call</mat-icon>
            <input matInput type="tel" formControlName="phone" placeholder="+52 55 1234 5678" />
          </mat-form-field>
        </div>

        <mat-accordion class="opt-acc">
          <mat-expansion-panel>
            <mat-expansion-panel-header>
              <mat-panel-title><mat-icon>call</mat-icon> {{ 'profile.emergency' | transloco }}</mat-panel-title>
              <mat-panel-description>{{ 'users.form.emergencyHint' | transloco }}</mat-panel-description>
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
          <mat-expansion-panel>
            <mat-expansion-panel-header>
              <mat-panel-title><mat-icon>place</mat-icon> {{ 'profile.address' | transloco }}</mat-panel-title>
              <mat-panel-description>{{ 'users.form.addressHint' | transloco }}</mat-panel-description>
            </mat-expansion-panel-header>
            <mat-form-field appearance="outline" class="full">
              <mat-label>{{ 'profile.address' | transloco }}</mat-label>
              <textarea matInput rows="2" formControlName="address" [placeholder]="'profile.addressPlaceholder' | transloco"></textarea>
            </mat-form-field>
          </mat-expansion-panel>
        </mat-accordion>
      </section>

      <!-- 2) Datos de empresa -->
      <section class="fs">
        <div class="fs-head"><mat-icon>apartment</mat-icon><h4>{{ 'profile.companyData' | transloco }}</h4><span class="opt">{{ 'users.form.optional' | transloco }}</span></div>
        <div class="grid2">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'profile.hireDate' | transloco }}</mat-label>
            <input matInput type="date" formControlName="hireDate" />
            <mat-hint>{{ 'profile.hireDateHint' | transloco }}</mat-hint>
          </mat-form-field>
        </div>
      </section>

      <!-- 3) Cuenta y acceso -->
      <section class="fs">
        <div class="fs-head"><mat-icon>lock</mat-icon><h4>{{ 'users.form.account' | transloco }}</h4></div>
        <div class="grid2">
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ 'users.form.email' | transloco }} *</mat-label>
            <mat-icon matPrefix>mail</mat-icon>
            <input matInput type="email" formControlName="email" placeholder="nombre@empresa.mx" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'users.form.password' | transloco }} *</mat-label>
            <mat-icon matPrefix>lock</mat-icon>
            <input matInput [type]="showPw() ? 'text' : 'password'" formControlName="password" autocomplete="new-password" />
            <button mat-icon-button matSuffix type="button" (click)="showPw.set(!showPw())" [attr.aria-label]="(showPw() ? 'common.hide' : 'common.show') | transloco">
              <mat-icon>{{ showPw() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
            <mat-hint><a class="link" (click)="generatePassword()">{{ 'password.generate' | transloco }}</a> · {{ 'password.minLength' | transloco }}</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'users.roles' | transloco }}</mat-label>
            <mat-select formControlName="roleCodes" multiple>
              @for (role of data.assignableRoles; track role.code) {
                <mat-option [value]="role.code">{{ roleLabel(role.code) }}</mat-option>
              }
            </mat-select>
            <mat-hint>{{ 'users.form.rolesHint' | transloco }}</mat-hint>
          </mat-form-field>
        </div>
      </section>
    </form>

    <div class="m-foot">
      <span class="note"><mat-icon>info</mat-icon> {{ 'users.form.requiredNote' | transloco }}</span>
      <span class="fill"></span>
      <button mat-button (click)="close()">{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid || saving()" (click)="submit()">
        <mat-icon>check</mat-icon> {{ 'users.form.create' | transloco }}
      </button>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .m-head { display: flex; align-items: center; gap: 14px; padding: 20px 28px 16px; border-bottom: 1px solid var(--nx-color-border-default); }
      .m-head .badge-ic { width: 44px; height: 44px; border-radius: 12px; background: var(--nx-color-action-primary-subtle); color: var(--nx-color-action-primary); display: grid; place-items: center; border: 1px solid var(--nx-color-border-brand); flex: none; }
      .m-head .t { flex: 1; }
      .m-head h2 { margin: 0; font-size: 1.15rem; font-weight: var(--nx-font-weight-bold); }
      .m-head p { margin: 2px 0 0; color: var(--nx-color-text-secondary); font-size: var(--nx-text-small-size); }
      .m-body { padding: 8px 28px 12px; max-height: 62vh; overflow-y: auto; }
      .fs { padding: 16px 0; }
      .fs + .fs { border-top: 1px solid var(--nx-color-border-default); }
      .fs-head { display: flex; align-items: center; gap: 9px; margin-bottom: 12px; }
      .fs-head mat-icon { color: var(--nx-color-action-primary); }
      .fs-head h4 { margin: 0; font-size: var(--nx-text-body-size); font-weight: var(--nx-font-weight-bold); }
      .fs-head .opt { margin-left: 4px; font-size: var(--nx-text-caption-size); font-weight: var(--nx-font-weight-bold); text-transform: uppercase; letter-spacing: .05em; color: var(--nx-color-text-disabled); border: 1px solid var(--nx-color-border-default); border-radius: var(--nx-radius-full); padding: 2px 8px; }
      .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 var(--nx-space-4); }
      .grid2 .full { grid-column: 1 / -1; }
      mat-form-field { width: 100%; }
      .opt-acc { margin-top: 6px; display: block; }
      .m-foot { display: flex; align-items: center; gap: 10px; padding: 14px 28px 18px; border-top: 1px solid var(--nx-color-border-default); }
      .m-foot .note { display: inline-flex; align-items: center; gap: 6px; font-size: var(--nx-text-small-size); color: var(--nx-color-text-secondary); }
      .m-foot .note mat-icon { font-size: 18px; width: 18px; height: 18px; }
      .m-foot .fill { flex: 1; }
      .link { color: var(--nx-color-action-primary); cursor: pointer; font-weight: var(--nx-font-weight-semibold); }
      @media (max-width: 640px) { .grid2 { grid-template-columns: 1fr; } }
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
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    this.saving.set(true);

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
          this.notify.error(localizedProblem(this.transloco, err, 'users.form.createError'));
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
