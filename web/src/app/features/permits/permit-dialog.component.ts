import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthStore } from '../../core/auth/auth.store';
import { NotificationService } from '../../core/ui/notification.service';
import { User } from '../admin/users/user.models';
import { UserService } from '../admin/users/user.service';
import { PERMIT_REASONS, PERMIT_TYPES, PayStatus, PermitReason, PermitType } from './permit.models';
import { PermitService } from './permit.service';

/**
 * Registrar un permiso para un colaborador (admin, RR. HH. o supervisor). Nace aprobado.
 * Entrada tarde / salida temprano: un día y la hora autorizada. Falta: rango de fechas.
 * El goce de sueldo solo aparece para quien tiene {@code permit:pay} (RR. HH.); si no se elige,
 * queda pendiente de revisión.
 */
@Component({
  selector: 'app-permit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    TranslocoPipe,
  ],
  template: `
    <div class="m-head">
      <div class="badge-ic"><mat-icon>event_busy</mat-icon></div>
      <div class="t"><h2>{{ 'permits.dialog.title' | transloco }}</h2><p>{{ 'permits.dialog.subtitle' | transloco }}</p></div>
      <button mat-icon-button (click)="close(false)" [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
    </div>

    <form [formGroup]="form" class="m-body">
      <mat-form-field appearance="outline" class="full">
        <mat-label>{{ 'permits.collaborator' | transloco }} *</mat-label>
        <mat-select formControlName="userId">
          @for (u of users(); track u.id) {
            <mat-option [value]="u.id">{{ u.firstName }} {{ u.lastName }}{{ u.employeeCode ? ' · ' + u.employeeCode : '' }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <div class="grid2">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'permits.type' | transloco }} *</mat-label>
          <mat-select formControlName="type">
            @for (t of types; track t) { <mat-option [value]="t">{{ 'permits.types.' + t | transloco }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'permits.reason' | transloco }} *</mat-label>
          <mat-select formControlName="reason">
            @for (r of reasons; track r) { <mat-option [value]="r">{{ 'permits.reasons.' + r | transloco }}</mat-option> }
          </mat-select>
        </mat-form-field>
      </div>
      <div class="grid2">
        @if (isAbsence()) {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'period.from' | transloco }} *</mat-label>
            <input matInput type="date" formControlName="startDate" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'period.to' | transloco }} *</mat-label>
            <input matInput type="date" formControlName="endDate" />
          </mat-form-field>
        } @else {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'permits.date' | transloco }} *</mat-label>
            <input matInput type="date" formControlName="startDate" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ (type() === 'LATE_ARRIVAL' ? 'permits.arrivalTime' : 'permits.departureTime') | transloco }} *</mat-label>
            <input matInput type="time" formControlName="timeAt" />
          </mat-form-field>
        }
      </div>
      @if (canDecidePay) {
        <mat-form-field appearance="outline" class="full">
          <mat-label>{{ 'permits.pay' | transloco }}</mat-label>
          <mat-select formControlName="payStatus">
            <mat-option value="">{{ 'permits.payStatus.PENDING_REVIEW' | transloco }}</mat-option>
            <mat-option value="WITH_PAY">{{ 'permits.payStatus.WITH_PAY' | transloco }}</mat-option>
            <mat-option value="WITHOUT_PAY">{{ 'permits.payStatus.WITHOUT_PAY' | transloco }}</mat-option>
          </mat-select>
        </mat-form-field>
      } @else {
        <p class="nx-text-small nx-sec hint">{{ 'permits.dialog.payHint' | transloco }}</p>
      }
      <mat-form-field appearance="outline" class="full">
        <mat-label>{{ 'permits.notes' | transloco }}</mat-label>
        <textarea matInput rows="2" maxlength="500" formControlName="notes" [placeholder]="'users.form.optional' | transloco"></textarea>
      </mat-form-field>
    </form>

    <div class="m-foot">
      <span class="fill"></span>
      <button mat-button (click)="close(false)">{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button color="primary" [disabled]="!valid() || saving()" (click)="submit()">
        <mat-icon>check</mat-icon> {{ 'permits.dialog.submit' | transloco }}
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
      .m-body { padding: 8px 28px 12px; }
      .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 var(--nx-space-4); }
      mat-form-field { width: 100%; }
      .hint { margin: 0 0 var(--nx-space-4); }
      .m-foot { display: flex; align-items: center; gap: 10px; padding: 14px 28px 18px; border-top: 1px solid var(--nx-color-border-default); }
      .m-foot .fill { flex: 1; }
      @media (max-width: 599px) { .grid2 { grid-template-columns: 1fr; } .m-head, .m-body, .m-foot { padding-left: 16px; padding-right: 16px; } }
    `,
  ],
})
export class PermitDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(PermitService);
  private readonly userService = inject(UserService);
  private readonly notify = inject(NotificationService);
  private readonly dialogRef = inject(MatDialogRef<PermitDialogComponent, boolean>);
  private readonly transloco = inject(TranslocoService);

  protected readonly types = PERMIT_TYPES;
  protected readonly reasons = PERMIT_REASONS;
  protected readonly canDecidePay = inject(AuthStore).hasPermission('permit:pay');

  protected readonly users = signal<User[]>([]);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    userId: ['', [Validators.required]],
    type: ['ABSENCE' as PermitType, [Validators.required]],
    reason: ['PERSONAL' as PermitReason, [Validators.required]],
    startDate: ['', [Validators.required]],
    endDate: [''],
    timeAt: [''],
    payStatus: ['' as '' | Exclude<PayStatus, 'PENDING_REVIEW'>],
    notes: [''],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly type = computed(() => this.value().type);
  protected readonly isAbsence = computed(() => this.type() === 'ABSENCE');

  /** Las reglas que dependen del tipo (rango o hora) se validan aquí y no con Validators. */
  protected readonly valid = computed(() => {
    const v = this.value();
    if (!v.userId || !v.startDate) return false;
    return v.type === 'ABSENCE' ? !!v.endDate && v.endDate >= v.startDate : !!v.timeAt;
  });

  constructor() {
    this.userService.list(0, 500).subscribe({
      next: (r) => this.users.set(r.content),
      error: () => void 0,
    });
  }

  protected close(result: boolean): void {
    this.dialogRef.close(result);
  }

  protected submit(): void {
    if (!this.valid()) return;
    const raw = this.form.getRawValue();
    const absence = raw.type === 'ABSENCE';
    this.saving.set(true);
    this.service
      .create({
        userId: raw.userId,
        type: raw.type,
        reason: raw.reason,
        startDate: raw.startDate,
        endDate: absence ? raw.endDate : undefined,
        timeAt: absence ? undefined : raw.timeAt,
        notes: raw.notes.trim() || undefined,
        payStatus: this.canDecidePay && raw.payStatus ? raw.payStatus : undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notify.success(this.transloco.translate('permits.dialog.created'));
          this.dialogRef.close(true);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          const overlap = err instanceof HttpErrorResponse && err.status === 409;
          this.notify.error(this.transloco.translate(overlap ? 'permits.dialog.overlap' : 'permits.dialog.createError'));
        },
      });
  }
}
