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

import { DirectoryOptionsService, EmployeeOption, employeeLabel } from '../../core/directory/directory-options.service';
import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { AlertComponent } from '../../core/ui/alert.component';
import { NotificationService } from '../../core/ui/notification.service';
import { ScrollDirective } from '../../core/ui/scroll.directive';
import { SANCTION_REASONS, SANCTION_TYPES, SanctionReason, SanctionType, suspensionEnd } from './sanction.models';
import { SanctionService } from './sanction.service';

/**
 * Abrir una sanción a un colaborador (RR. HH., supervisor o administrador), en Drawer sobre la
 * bandeja como el alta de permisos. Nace vigente. La descripción de los hechos es obligatoria; la
 * suspensión pide fecha de inicio y días, y muestra hasta cuándo dura.
 */
@Component({
  selector: 'app-sanction-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    TranslocoPipe,
    AppDatePipe,
    AlertComponent,
    ScrollDirective,
  ],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3" mat-dialog-title>{{ 'sanctions.dialog.title' | transloco }}</h2>
      <button mat-icon-button type="button" (click)="close(false)" [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
    </div>

    <form [formGroup]="form" class="nx-capa__cuerpo nx-scroll" nxScroll id="sancion" (ngSubmit)="submit()" novalidate aria-live="polite">
      <p class="nx-text-small nx-sec">{{ 'sanctions.dialog.subtitle' | transloco }}</p>
      @if (problem()) { <app-alert tone="error">{{ problem() }}</app-alert> }
      @if (usersError()) { <app-alert tone="error">{{ 'common.collaboratorsLoadError' | transloco }}</app-alert> }

      <div class="nx-form__grid">
        <mat-form-field appearance="outline" class="nx-campo--ancho">
          <mat-label>{{ 'sanctions.collaborator' | transloco }}</mat-label>
          <mat-select formControlName="userId" required>
            @for (u of users(); track u.id) { <mat-option [value]="u.id">{{ label(u) }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'sanctions.type' | transloco }}</mat-label>
          <mat-select formControlName="type" required>
            @for (t of types; track t) { <mat-option [value]="t">{{ 'sanctions.types.' + t | transloco }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'sanctions.reason' | transloco }}</mat-label>
          <mat-select formControlName="reason" required>
            @for (r of reasons; track r) { <mat-option [value]="r">{{ 'sanctions.reasons.' + r | transloco }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'sanctions.incidentDate' | transloco }}</mat-label>
          <input matInput type="date" formControlName="incidentDate" required />
        </mat-form-field>
        @if (isSuspension()) {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'sanctions.suspensionStart' | transloco }}</mat-label>
            <input matInput type="date" formControlName="suspensionStart" required />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'sanctions.suspensionDays' | transloco }}</mat-label>
            <input matInput type="number" min="1" max="365" formControlName="suspensionDays" required />
            @if (end()) { <mat-hint>{{ 'sanctions.until' | transloco }} {{ end() | appDate: 'dd/MM/yyyy' }}</mat-hint> }
          </mat-form-field>
        }
        <mat-form-field appearance="outline" class="nx-campo--ancho">
          <mat-label>{{ 'sanctions.description' | transloco }}</mat-label>
          <textarea matInput rows="4" maxlength="1000" formControlName="description" required></textarea>
          <mat-hint>{{ 'sanctions.dialog.descriptionHint' | transloco }}</mat-hint>
          @if (form.controls.description.touched && form.controls.description.invalid) {
            <mat-error>{{ 'sanctions.dialog.descriptionRequired' | transloco }}</mat-error>
          }
        </mat-form-field>
      </div>
    </form>

    <div class="nx-capa__pie">
      <button mat-button type="button" (click)="close(false)"><mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button type="submit" form="sancion" [disabled]="saving()" [attr.aria-busy]="saving()">
        @if (saving()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>save</mat-icon> }
        {{ 'sanctions.dialog.submit' | transloco }}
      </button>
    </div>
  `,
  styles: [
    `
      h2, p { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      .nx-capa__pie .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
    `,
  ],
})
export class SanctionDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SanctionService);
  private readonly directory = inject(DirectoryOptionsService);
  private readonly notify = inject(NotificationService);
  private readonly dialogRef = inject(MatDialogRef<SanctionDialogComponent, boolean>);
  private readonly transloco = inject(TranslocoService);

  protected readonly types = SANCTION_TYPES;
  protected readonly reasons = SANCTION_REASONS;
  protected readonly users = signal<EmployeeOption[]>([]);
  protected readonly usersError = signal(false);
  protected readonly label = employeeLabel;
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    userId: ['', [Validators.required]],
    type: ['VERBAL_WARNING' as SanctionType, [Validators.required]],
    reason: ['TARDINESS' as SanctionReason, [Validators.required]],
    incidentDate: ['', [Validators.required]],
    suspensionStart: [''],
    suspensionDays: [null as number | null],
    description: ['', [Validators.required, Validators.pattern(/\S/)]],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly isSuspension = computed(() => this.value().type === 'SUSPENSION');
  protected readonly end = computed(() => {
    const v = this.value();
    return v.type === 'SUSPENSION' ? suspensionEnd(v.suspensionStart, v.suspensionDays ?? undefined) : '';
  });

  constructor() {
    const applyTypeRules = (type: SanctionType) => {
      const { suspensionStart, suspensionDays } = this.form.controls;
      const suspension = type === 'SUSPENSION';
      suspensionStart.setValidators(suspension ? [Validators.required] : []);
      suspensionDays.setValidators(suspension ? [Validators.required, Validators.min(1), Validators.max(365)] : []);
      suspensionStart.updateValueAndValidity({ emitEvent: false });
      suspensionDays.updateValueAndValidity({ emitEvent: false });
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
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.problem.set(null);
    const raw = this.form.getRawValue();
    const suspension = raw.type === 'SUSPENSION';
    this.saving.set(true);
    this.service
      .create({
        userId: raw.userId,
        type: raw.type,
        reason: raw.reason,
        incidentDate: raw.incidentDate,
        description: raw.description.trim(),
        suspensionStart: suspension ? raw.suspensionStart : undefined,
        suspensionDays: suspension && raw.suspensionDays ? raw.suspensionDays : undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notify.success(this.transloco.translate('sanctions.dialog.created'));
          this.dialogRef.close(true);
        },
        error: () => {
          this.saving.set(false);
          this.problem.set(this.transloco.translate('sanctions.dialog.createError'));
        },
      });
  }
}
