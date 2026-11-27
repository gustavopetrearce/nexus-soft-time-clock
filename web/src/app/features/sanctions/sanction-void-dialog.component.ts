import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';

import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { Sanction } from './sanction.models';

/** Anular una sanción: motivo obligatorio y definitivo. Devuelve el motivo, o `undefined`. */
@Component({
  selector: 'app-sanction-void-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, TranslocoPipe, AppDatePipe],
  styles: [
    `
      h2, p { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      .resumen { display: flex; flex-direction: column; gap: var(--nx-space-1); margin-bottom: var(--nx-space-4); }
    `,
  ],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3" mat-dialog-title>{{ 'sanctions.voidDialog.title' | transloco }}</h2>
    </div>
    <form class="nx-capa__cuerpo" [formGroup]="form">
      <div class="resumen">
        <b>{{ data.userName || data.userId }}</b>
        <span class="nx-sec nx-text-small">
          {{ 'sanctions.types.' + data.type | transloco }} · {{ 'sanctions.reasons.' + data.reason | transloco }} ·
          {{ data.incidentDate | appDate: 'dd/MM/yyyy' }}
        </span>
        <span class="nx-text-small">{{ data.description }}</span>
      </div>
      <p class="nx-text-small" style="margin-bottom: var(--nx-space-4)">{{ 'sanctions.voidDialog.message' | transloco }}</p>
      <mat-form-field appearance="outline">
        <mat-label>{{ 'sanctions.voidDialog.reason' | transloco }}</mat-label>
        <textarea matInput rows="2" maxlength="500" formControlName="reason" required></textarea>
        @if (form.controls.reason.touched && form.controls.reason.invalid) {
          <mat-error>{{ 'sanctions.voidDialog.reasonRequired' | transloco }}</mat-error>
        }
      </mat-form-field>
    </form>
    <div class="nx-capa__pie">
      <button mat-button type="button" cdkFocusInitial (click)="ref.close()"><mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button color="warn" type="button" (click)="confirm()">{{ 'sanctions.voidDialog.submit' | transloco }}</button>
    </div>
  `,
})
export class SanctionVoidDialogComponent {
  protected readonly data = inject<Sanction>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<SanctionVoidDialogComponent, string>);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    reason: ['', [Validators.required, Validators.pattern(/\S/)]],
  });

  protected confirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.ref.close(this.form.getRawValue().reason.trim());
  }
}
