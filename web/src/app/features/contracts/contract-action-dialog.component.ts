import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';

import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { Contract, isoToday } from './contract.models';

export type ContractActionMode = 'end' | 'cancel';

export interface ContractActionData {
  mode: ContractActionMode;
  contract: Contract;
}

/** Resultado al confirmar: la fecha de término o la causa de cancelación. */
export interface ContractAction {
  endDate?: string;
  reason?: string;
}

/**
 * Dos acciones sobre un contrato:
 * <ul>
 *   <li>{@code end} — terminarlo en una fecha (recorta la vigencia; no la amplía).</li>
 *   <li>{@code cancel} — anularlo por captura errónea; definitivo y con causa obligatoria.</li>
 * </ul>
 */
@Component({
  selector: 'app-contract-action-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, TranslocoPipe, AppDatePipe],
  styles: [
    `
      h2, p { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      .resumen { display: flex; flex-direction: column; gap: var(--nx-space-1); margin-bottom: var(--nx-space-4); }
      .msg { margin-bottom: var(--nx-space-4); }
    `,
  ],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3" mat-dialog-title>
        {{ (data.mode === 'end' ? 'contracts.endDialog.title' : 'contracts.cancelDialog.title') | transloco }}
      </h2>
    </div>
    <form class="nx-capa__cuerpo" [formGroup]="form">
      <div class="resumen">
        <b>{{ data.contract.userName || data.contract.userId }}</b>
        <span class="nx-sec nx-text-small">
          {{ 'contracts.types.' + data.contract.type | transloco }}
          @if (data.contract.projectCode) { · {{ data.contract.projectCode }} }
          · {{ data.contract.startsOn | appDate: 'dd/MM/yyyy' }} –
          {{ data.contract.endsOn ? (data.contract.endsOn | appDate: 'dd/MM/yyyy') : ('contracts.indefinite' | transloco) }}
        </span>
      </div>

      <p class="nx-text-small msg">{{ (data.mode === 'end' ? 'contracts.endDialog.message' : 'contracts.cancelDialog.message') | transloco }}</p>

      @if (data.mode === 'end') {
        <mat-form-field appearance="outline">
          <mat-label>{{ 'contracts.endDialog.date' | transloco }} *</mat-label>
          <input matInput type="date" formControlName="endDate" [min]="data.contract.startsOn" [max]="data.contract.endsOn ?? null" />
        </mat-form-field>
      } @else {
        <mat-form-field appearance="outline">
          <mat-label>{{ 'contracts.cancelDialog.reason' | transloco }} *</mat-label>
          <textarea matInput rows="2" maxlength="500" formControlName="reason"></textarea>
        </mat-form-field>
      }
    </form>
    <div class="nx-capa__pie">
      <button mat-button type="button" cdkFocusInitial (click)="ref.close()">
        <mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}
      </button>
      <button mat-flat-button type="button" [color]="data.mode === 'cancel' ? 'warn' : 'primary'"
              [disabled]="!canConfirm()" (click)="confirm()">
        {{ (data.mode === 'end' ? 'contracts.endDialog.submit' : 'contracts.cancelDialog.submit') | transloco }}
      </button>
    </div>
  `,
})
export class ContractActionDialogComponent {
  protected readonly data = inject<ContractActionData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<ContractActionDialogComponent, ContractAction>);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    endDate: [this.defaultEnd(), [Validators.required]],
    reason: [''],
  });

  /** Hoy, acotado al periodo del contrato. */
  private defaultEnd(): string {
    const c = this.data.contract;
    let d = isoToday();
    if (d < c.startsOn) d = c.startsOn;
    if (c.endsOn && d > c.endsOn) d = c.endsOn;
    return d;
  }

  protected canConfirm(): boolean {
    const { endDate, reason } = this.form.getRawValue();
    if (this.data.mode === 'cancel') return !!reason.trim();
    const c = this.data.contract;
    return !!endDate && endDate >= c.startsOn && (!c.endsOn || endDate <= c.endsOn);
  }

  protected confirm(): void {
    if (!this.canConfirm()) return;
    const { endDate, reason } = this.form.getRawValue();
    this.ref.close(this.data.mode === 'end' ? { endDate } : { reason: reason.trim() });
  }
}
