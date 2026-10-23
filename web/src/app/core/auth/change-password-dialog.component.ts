import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { NotificationService } from '../ui/notification.service';
import { AuthService } from './auth.service';

/** Validador de grupo: la nueva contraseña y su confirmación deben coincidir. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const next = group.get('newPassword')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return next && confirm && next !== confirm ? { mismatch: true } : null;
}

/** Cambio de contraseña del propio usuario: exige la actual y confirma la nueva. */
@Component({
  selector: 'app-change-password-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    <div class="m-head">
      <div class="badge-ic"><mat-icon>lock_reset</mat-icon></div>
      <div class="t">
        <h2>{{ 'password.title' | transloco }}</h2>
        <p>{{ 'password.subtitle' | transloco }}</p>
      </div>
      <button mat-icon-button (click)="close(false)" [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
    </div>

    <form [formGroup]="form" class="m-body">
      <mat-form-field appearance="outline" class="full">
        <mat-label>{{ 'password.current' | transloco }}</mat-label>
        <mat-icon matPrefix>lock</mat-icon>
        <input matInput [type]="showCurrent() ? 'text' : 'password'" formControlName="currentPassword" autocomplete="current-password" />
        <button mat-icon-button matSuffix type="button" (click)="showCurrent.set(!showCurrent())" [attr.aria-label]="(showCurrent() ? 'common.hide' : 'common.show') | transloco">
          <mat-icon>{{ showCurrent() ? 'visibility_off' : 'visibility' }}</mat-icon>
        </button>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full">
        <mat-label>{{ 'password.new' | transloco }}</mat-label>
        <mat-icon matPrefix>lock</mat-icon>
        <input matInput [type]="showNew() ? 'text' : 'password'" formControlName="newPassword" autocomplete="new-password" />
        <button mat-icon-button matSuffix type="button" (click)="showNew.set(!showNew())" [attr.aria-label]="(showNew() ? 'common.hide' : 'common.show') | transloco">
          <mat-icon>{{ showNew() ? 'visibility_off' : 'visibility' }}</mat-icon>
        </button>
        <mat-hint><a class="link" (click)="generatePassword()">{{ 'password.generate' | transloco }}</a> · {{ 'password.minLength' | transloco }}</mat-hint>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full">
        <mat-label>{{ 'password.confirm' | transloco }}</mat-label>
        <mat-icon matPrefix>lock</mat-icon>
        <input matInput [type]="showNew() ? 'text' : 'password'" formControlName="confirmPassword" autocomplete="new-password" />
        @if (form.hasError('mismatch') && form.controls.confirmPassword.touched) {
          <mat-error>{{ 'password.mismatch' | transloco }}</mat-error>
        }
      </mat-form-field>
    </form>

    <div class="m-foot">
      <span class="fill"></span>
      <button mat-button (click)="close(false)">{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid || saving()" (click)="submit()">
        <mat-icon>check</mat-icon> {{ 'password.submit' | transloco }}
      </button>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .m-head { display: flex; align-items: center; gap: 14px; padding: 20px 28px 16px; border-bottom: 1px solid var(--border); }
      .m-head .badge-ic { width: 44px; height: 44px; border-radius: 12px; background: var(--brand-soft); color: var(--brand); display: grid; place-items: center; border: 1px solid var(--brand-border); flex: none; }
      .m-head .t { flex: 1; }
      .m-head h2 { margin: 0; font-size: 1.15rem; font-weight: 700; }
      .m-head p { margin: 2px 0 0; color: var(--text-muted); font-size: var(--font-small); }
      .m-body { padding: 16px 28px 4px; display: flex; flex-direction: column; }
      .m-body .full { width: 100%; }
      .m-foot { display: flex; align-items: center; gap: 10px; padding: 14px 28px 18px; border-top: 1px solid var(--border); }
      .m-foot .fill { flex: 1; }
      .link { color: var(--brand); cursor: pointer; font-weight: 600; }
    `,
  ],
})
export class ChangePasswordDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly dialogRef = inject(MatDialogRef<ChangePasswordDialogComponent, boolean>);

  protected readonly showCurrent = signal(false);
  protected readonly showNew = signal(false);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  protected generatePassword(): void {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#%';
    let pw = '';
    const rnd = new Uint32Array(14);
    crypto.getRandomValues(rnd);
    for (const n of rnd) pw += chars[n % chars.length];
    this.form.controls.newPassword.setValue(pw);
    this.form.controls.confirmPassword.setValue(pw);
    this.showNew.set(true);
  }

  protected close(result: boolean): void {
    this.dialogRef.close(result);
  }

  protected submit(): void {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.authService.changePassword(raw.currentPassword, raw.newPassword).subscribe({
      next: () => {
        this.saving.set(false);
        this.notify.success(this.transloco.translate('password.updated'));
        this.close(true);
      },
      error: (err: { status?: number }) => {
        this.saving.set(false);
        this.notify.error(
          this.transloco.translate(err?.status === 401 ? 'password.wrongCurrent' : 'password.failed'),
        );
      },
    });
  }
}
