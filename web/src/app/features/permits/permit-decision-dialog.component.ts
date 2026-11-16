import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { TranslocoPipe } from '@jsverse/transloco';

import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { PayStatus, Permit } from './permit.models';

export type PermitDecisionMode = 'pay' | 'cancel';

export interface PermitDecisionData {
  mode: PermitDecisionMode;
  permit: Permit;
}

/** Resultado al confirmar; `undefined` si se cierra sin confirmar. */
export interface PermitDecision {
  payStatus?: Exclude<PayStatus, 'PENDING_REVIEW'>;
  note: string;
}

/**
 * Dos decisiones sobre un permiso ya aprobado, con nota opcional:
 * <ul>
 *   <li>{@code pay} — RR. HH. revisa y decide con o sin goce de sueldo (puede re-decidir).</li>
 *   <li>{@code cancel} — anular el permiso; es definitivo (botón en tono error).</li>
 * </ul>
 */
@Component({
  selector: 'app-permit-decision-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatRadioModule, TranslocoPipe, AppDatePipe],
  styles: [
    `
      h2, p { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      .resumen { display: flex; flex-direction: column; gap: var(--nx-space-1); margin-bottom: var(--nx-space-4); }
      .opciones { display: flex; flex-direction: column; gap: var(--nx-space-1); margin-bottom: var(--nx-space-4); }
    `,
  ],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3" mat-dialog-title>
        {{ (data.mode === 'pay' ? 'permits.payDialog.title' : 'permits.cancelDialog.title') | transloco }}
      </h2>
    </div>
    <form class="nx-capa__cuerpo" [formGroup]="form">
      <div class="resumen">
        <b>{{ data.permit.userName || data.permit.userId }}</b>
        <span class="nx-sec nx-text-small">
          {{ 'permits.types.' + data.permit.type | transloco }} · {{ 'permits.reasons.' + data.permit.reason | transloco }} ·
          {{ data.permit.startDate | appDate: 'dd/MM/yyyy' }}@if (data.permit.endDate !== data.permit.startDate) { – {{ data.permit.endDate | appDate: 'dd/MM/yyyy' }} }
        </span>
        @if (data.permit.grantedByName) {
          <span class="nx-sec nx-text-small">{{ 'permits.grantedBy' | transloco }}: {{ data.permit.grantedByName }}</span>
        }
      </div>

      @if (data.mode === 'pay') {
        <mat-radio-group class="opciones" formControlName="payStatus" [attr.aria-label]="'permits.pay' | transloco">
          <mat-radio-button value="WITH_PAY">{{ 'permits.payStatus.WITH_PAY' | transloco }}</mat-radio-button>
          <mat-radio-button value="WITHOUT_PAY">{{ 'permits.payStatus.WITHOUT_PAY' | transloco }}</mat-radio-button>
        </mat-radio-group>
      } @else {
        <p class="nx-text-small" style="margin-bottom: var(--nx-space-4)">{{ 'permits.cancelDialog.message' | transloco }}</p>
      }

      <mat-form-field appearance="outline">
        <mat-label>{{ 'permits.note' | transloco }}</mat-label>
        <textarea matInput rows="2" maxlength="500" formControlName="note" [placeholder]="'users.form.optional' | transloco"></textarea>
      </mat-form-field>
    </form>
    <div class="nx-capa__pie">
      <button mat-button type="button" cdkFocusInitial (click)="ref.close()">
        <mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}
      </button>
      <button mat-flat-button type="button" [color]="data.mode === 'cancel' ? 'warn' : 'primary'"
              [disabled]="data.mode === 'pay' && !form.controls.payStatus.value" (click)="confirm()">
        {{ (data.mode === 'pay' ? 'permits.payDialog.submit' : 'permits.cancelDialog.submit') | transloco }}
      </button>
    </div>
  `,
})
export class PermitDecisionDialogComponent {
  protected readonly data = inject<PermitDecisionData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<PermitDecisionDialogComponent, PermitDecision>);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    payStatus: [(this.data.permit.payStatus === 'PENDING_REVIEW' ? '' : this.data.permit.payStatus) as '' | Exclude<PayStatus, 'PENDING_REVIEW'>],
    note: [this.data.mode === 'pay' ? this.data.permit.payNote ?? '' : ''],
  });

  protected confirm(): void {
    const { payStatus, note } = this.form.getRawValue();
    if (this.data.mode === 'pay' && !payStatus) return;
    this.ref.close({ payStatus: payStatus || undefined, note: note.trim() });
  }
}
