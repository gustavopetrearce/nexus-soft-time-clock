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

import { AlertComponent } from '../../core/ui/alert.component';
import { NotificationService } from '../../core/ui/notification.service';
import { ScrollDirective } from '../../core/ui/scroll.directive';
import { DirectoryOptionsService, EmployeeOption, employeeLabel } from '../../core/directory/directory-options.service';
import { VacationService } from './vacation.service';

/**
 * Alta de una solicitud de vacaciones desde el panel (a nombre de un colaborador), en Drawer sobre
 * la bandeja P19 como las altas del catálogo (HIFI/08, reglas comunes; sin maqueta propia).
 * El backend calcula los días según la política y abre la solicitud como PENDING.
 * Requiere {@code vacation:request} (o {@code vacation:approve}).
 */
@Component({
  selector: 'app-vacation-request-dialog',
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
      <h2 class="nx-text-heading-3" mat-dialog-title>{{ 'vacations.dialog.title' | transloco }}</h2>
      <button mat-icon-button type="button" (click)="close(false)" [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
    </div>

    <form [formGroup]="form" class="nx-capa__cuerpo nx-scroll" nxScroll id="solicitud-vacaciones" (ngSubmit)="submit()" novalidate aria-live="polite">
      <p class="nx-text-small nx-sec">{{ 'vacations.dialog.subtitle' | transloco }}</p>
      @if (problem()) { <app-alert tone="error">{{ problem() }}</app-alert> }
      @if (usersError()) { <app-alert tone="error">{{ 'common.collaboratorsLoadError' | transloco }}</app-alert> }

      <div class="nx-form__grid">
        <mat-form-field appearance="outline" class="nx-campo--ancho">
          <mat-label>{{ 'users.employee' | transloco }}</mat-label>
          <mat-select formControlName="userId" required>
            @for (u of users(); track u.id) {
              <mat-option [value]="u.id">{{ label(u) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'scheduling.from' | transloco }}</mat-label>
          <input matInput type="date" formControlName="startDate" required />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'period.to' | transloco }}</mat-label>
          <input matInput type="date" formControlName="endDate" required />
        </mat-form-field>
        @if (rangeInvalid()) {
          <p class="nx-text-caption err nx-campo--ancho" role="alert">{{ 'vacations.dialog.endBeforeStart' | transloco }}</p>
        }
        <mat-form-field appearance="outline" class="nx-campo--ancho">
          <mat-label>{{ 'vacations.reason' | transloco }}</mat-label>
          <input matInput formControlName="reason" />
          <mat-hint>{{ 'users.form.optional' | transloco }}</mat-hint>
        </mat-form-field>
      </div>
    </form>

    <div class="nx-capa__pie">
      <button mat-button type="button" (click)="close(false)"><mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button type="submit" form="solicitud-vacaciones" [disabled]="saving()" [attr.aria-busy]="saving()">
        @if (saving()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>save</mat-icon> }
        {{ 'vacations.dialog.submit' | transloco }}
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
export class VacationRequestDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(VacationService);
  private readonly directory = inject(DirectoryOptionsService);
  private readonly notify = inject(NotificationService);
  private readonly dialogRef = inject(MatDialogRef<VacationRequestDialogComponent, boolean>);
  private readonly transloco = inject(TranslocoService);

  protected readonly users = signal<EmployeeOption[]>([]);
  protected readonly usersError = signal(false);
  protected readonly label = employeeLabel;
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    userId: ['', [Validators.required]],
    startDate: ['', [Validators.required]],
    endDate: ['', [Validators.required]],
    reason: [''],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly rangeInvalid = computed(() => {
    const v = this.value();
    return !!v.startDate && !!v.endDate && v.endDate < v.startDate;
  });

  constructor() {
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
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.problem.set(null);
    this.service
      .create({ userId: raw.userId, startDate: raw.startDate, endDate: raw.endDate, reason: raw.reason || undefined })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notify.success(this.transloco.translate('vacations.dialog.created'));
          this.dialogRef.close(true);
        },
        error: () => {
          this.saving.set(false);
          this.problem.set(this.transloco.translate('vacations.dialog.createError'));
        },
      });
  }
}
