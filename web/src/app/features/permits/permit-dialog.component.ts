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
import { AlertComponent } from '../../core/ui/alert.component';
import { ScrollDirective } from '../../core/ui/scroll.directive';
import { NotificationService } from '../../core/ui/notification.service';
import { DirectoryOptionsService, EmployeeOption, employeeLabel } from '../../core/directory/directory-options.service';
import { PERMIT_REASONS, PERMIT_TYPES, PayStatus, PermitReason, PermitType } from './permit.models';
import { PermitService } from './permit.service';

/**
 * Registrar un permiso para un colaborador (admin, RR. HH. o supervisor), en Drawer sobre la
 * bandeja como las altas del catálogo (HIFI/08, reglas comunes; sin maqueta propia). Nace aprobado.
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
    AlertComponent,
    ScrollDirective,
  ],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3" mat-dialog-title>{{ 'permits.dialog.title' | transloco }}</h2>
      <button mat-icon-button type="button" (click)="close(false)" [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
    </div>

    <form [formGroup]="form" class="nx-capa__cuerpo nx-scroll" nxScroll id="permiso" (ngSubmit)="submit()" novalidate aria-live="polite">
      <p class="nx-text-small nx-sec">{{ 'permits.dialog.subtitle' | transloco }}</p>
      @if (problem()) { <app-alert tone="error">{{ problem() }}</app-alert> }
      @if (usersError()) { <app-alert tone="error">{{ 'common.collaboratorsLoadError' | transloco }}</app-alert> }

      <div class="nx-form__grid">
        <mat-form-field appearance="outline" class="nx-campo--ancho">
          <mat-label>{{ 'permits.collaborator' | transloco }}</mat-label>
          <mat-select formControlName="userId" required>
            @for (u of users(); track u.id) {
              <mat-option [value]="u.id">{{ label(u) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'permits.type' | transloco }}</mat-label>
          <mat-select formControlName="type" required>
            @for (t of types; track t) { <mat-option [value]="t">{{ 'permits.types.' + t | transloco }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'permits.reason' | transloco }}</mat-label>
          <mat-select formControlName="reason" required>
            @for (r of reasons; track r) { <mat-option [value]="r">{{ 'permits.reasons.' + r | transloco }}</mat-option> }
          </mat-select>
        </mat-form-field>
        @if (isAbsence()) {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'period.from' | transloco }}</mat-label>
            <input matInput type="date" formControlName="startDate" required />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'period.to' | transloco }}</mat-label>
            <input matInput type="date" formControlName="endDate" required />
          </mat-form-field>
        } @else {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'permits.date' | transloco }}</mat-label>
            <input matInput type="date" formControlName="startDate" required />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ (type() === 'LATE_ARRIVAL' ? 'permits.arrivalTime' : 'permits.departureTime') | transloco }}</mat-label>
            <input matInput type="time" formControlName="timeAt" required />
          </mat-form-field>
        }
        @if (rangeInvalid()) {
          <p class="nx-text-caption err nx-campo--ancho" role="alert">{{ 'projects.rangeInvalid' | transloco }}</p>
        }
        @if (canDecidePay) {
          <mat-form-field appearance="outline" class="nx-campo--ancho">
            <mat-label>{{ 'permits.pay' | transloco }}</mat-label>
            <mat-select formControlName="payStatus">
              <mat-option value="">{{ 'permits.payStatus.PENDING_REVIEW' | transloco }}</mat-option>
              <mat-option value="WITH_PAY">{{ 'permits.payStatus.WITH_PAY' | transloco }}</mat-option>
              <mat-option value="WITHOUT_PAY">{{ 'permits.payStatus.WITHOUT_PAY' | transloco }}</mat-option>
            </mat-select>
          </mat-form-field>
        } @else {
          <p class="nx-text-small nx-sec nx-campo--ancho">{{ 'permits.dialog.payHint' | transloco }}</p>
        }
        <mat-form-field appearance="outline" class="nx-campo--ancho">
          <mat-label>{{ 'permits.notes' | transloco }}</mat-label>
          <textarea matInput rows="2" maxlength="500" formControlName="notes"></textarea>
          <mat-hint>{{ 'users.form.optional' | transloco }}</mat-hint>
        </mat-form-field>
      </div>
    </form>

    <div class="nx-capa__pie">
      <button mat-button type="button" (click)="close(false)"><mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button type="submit" form="permiso" [disabled]="saving()" [attr.aria-busy]="saving()">
        @if (saving()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>save</mat-icon> }
        {{ 'permits.dialog.submit' | transloco }}
      </button>
    </div>
  `,
  styles: [
    `
      h2, p { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      .err { color: var(--nx-color-status-error-fg); }
      .nx-capa__pie .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
    `,
  ],
})
export class PermitDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(PermitService);
  private readonly directory = inject(DirectoryOptionsService);
  private readonly notify = inject(NotificationService);
  private readonly dialogRef = inject(MatDialogRef<PermitDialogComponent, boolean>);
  private readonly transloco = inject(TranslocoService);

  protected readonly types = PERMIT_TYPES;
  protected readonly reasons = PERMIT_REASONS;
  protected readonly canDecidePay = inject(AuthStore).hasPermission('permit:pay');

  protected readonly users = signal<EmployeeOption[]>([]);
  protected readonly usersError = signal(false);
  protected readonly label = employeeLabel;
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);

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

  /** Falta con fin anterior al inicio (los obligatorios por tipo van como Validators, ver abajo). */
  protected readonly rangeInvalid = computed(() => {
    const v = this.value();
    return v.type === 'ABSENCE' && !!v.startDate && !!v.endDate && v.endDate < v.startDate;
  });

  constructor() {
    // Falta: el fin es obligatorio; entrada tarde / salida temprano: la hora.
    const applyTypeRules = (type: PermitType) => {
      const { endDate, timeAt } = this.form.controls;
      endDate.setValidators(type === 'ABSENCE' ? [Validators.required] : []);
      timeAt.setValidators(type === 'ABSENCE' ? [] : [Validators.required]);
      endDate.updateValueAndValidity({ emitEvent: false });
      timeAt.updateValueAndValidity({ emitEvent: false });
    };
    applyTypeRules(this.form.controls.type.value);
    this.form.controls.type.valueChanges.subscribe(applyTypeRules);

    this.directory.employees().subscribe({
      next: (list) => this.users.set(list),
      error: () => this.usersError.set(true),
    });
  }

  protected close(result: boolean): void {
    this.dialogRef.close(result);
  }

  protected submit(): void {
    // El botón nunca se deshabilita antes del primer intento: los errores aparecen al enviar (C1, C2).
    if (this.form.invalid || this.rangeInvalid()) {
      this.form.markAllAsTouched();
      return;
    }
    this.problem.set(null);
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
          // 409 (se traslapa con otro permiso) → Aviso en el drawer, sin perder lo escrito.
          const overlap = err instanceof HttpErrorResponse && err.status === 409;
          this.problem.set(this.transloco.translate(overlap ? 'permits.dialog.overlap' : 'permits.dialog.createError'));
        },
      });
  }
}
