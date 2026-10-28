import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AlertComponent } from '../../../core/ui/alert.component';
import { localizedProblem } from '../../../core/ui/problem-detail';
import { ScrollDirective } from '../../../core/ui/scroll.directive';
import { Shift, ShiftRequest } from './scheduling.models';
import { SchedulingService } from './scheduling.service';

export interface ShiftDialogData {
  scheduleId: string;
  /** Turno a editar; sin él, se agrega uno nuevo. */
  shift?: Shift;
}

/**
 * Turno de un horario (P29, tabla editable): horas, cruce de medianoche como interruptor, descanso,
 * tolerancias de retardo y salida anticipada y la ventana de registro (RN-15, 30 min por defecto),
 * que decide si quien llega pronto puede marcar o se le rechaza por OUT_OF_SCHEDULE.
 */
@Component({
  selector: 'app-shift-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
    TranslocoPipe,
    AlertComponent,
    ScrollDirective,
  ],
  styles: [`h2 { margin: var(--nx-space-0); } mat-form-field { width: 100%; }`],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3" mat-dialog-title>{{ (data.shift ? 'scheduling.editShift' : 'scheduling.addShift') | transloco }}</h2>
    </div>
    <form class="nx-capa__cuerpo nx-scroll" nxScroll id="turno" [formGroup]="form" (ngSubmit)="save()" novalidate>
      @if (problem()) { <app-alert tone="error">{{ problem() }}</app-alert> }
      <mat-form-field appearance="outline">
        <mat-label>{{ 'common.name' | transloco }}</mat-label>
        <input matInput formControlName="name" required autocomplete="off" />
      </mat-form-field>
      <div class="nx-form__grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'scheduling.start' | transloco }}</mat-label>
          <input matInput type="time" formControlName="startTime" required />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'scheduling.end' | transloco }}</mat-label>
          <input matInput type="time" formControlName="endTime" required />
        </mat-form-field>
      </div>
      <mat-slide-toggle formControlName="crossesMidnight">{{ 'scheduling.crossesMidnight' | transloco }}</mat-slide-toggle>
      <div class="nx-form__grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'scheduling.breakMinutes' | transloco }}</mat-label>
          <input matInput type="number" min="0" formControlName="breakMinutes" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'scheduling.tolerance' | transloco }}</mat-label>
          <input matInput type="number" min="0" formControlName="lateToleranceMin" />
          <mat-hint>{{ 'scheduling.toleranceHint' | transloco }}</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'scheduling.earlyTolerance' | transloco }}</mat-label>
          <input matInput type="number" min="0" formControlName="earlyToleranceMin" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'scheduling.windowBefore' | transloco }}</mat-label>
          <input matInput type="number" min="0" formControlName="windowBeforeMin" />
          <mat-hint>{{ 'scheduling.windowBeforeHint' | transloco }}</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'scheduling.windowAfter' | transloco }}</mat-label>
          <input matInput type="number" min="0" formControlName="windowAfterMin" />
          <mat-hint>{{ 'scheduling.windowAfterHint' | transloco }}</mat-hint>
        </mat-form-field>
      </div>
    </form>
    <div class="nx-capa__pie">
      <button mat-button type="button" mat-dialog-close><mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button type="submit" form="turno" [disabled]="saving()"><mat-icon>save</mat-icon>{{ 'common.save' | transloco }}</button>
    </div>
  `,
})
export class ShiftDialogComponent {
  protected readonly data = inject<ShiftDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ShiftDialogComponent, boolean>>(MatDialogRef);
  private readonly service = inject(SchedulingService);
  private readonly transloco = inject(TranslocoService);

  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: [this.data.shift?.name ?? '', Validators.required],
    startTime: [this.data.shift?.startTime.substring(0, 5) ?? '08:00', Validators.required],
    endTime: [this.data.shift?.endTime.substring(0, 5) ?? '16:00', Validators.required],
    crossesMidnight: [this.data.shift?.crossesMidnight ?? false],
    breakMinutes: [this.data.shift?.breakMinutes ?? 60],
    lateToleranceMin: [this.data.shift?.lateToleranceMin ?? 10],
    earlyToleranceMin: [this.data.shift?.earlyToleranceMin ?? 10],
    windowBeforeMin: [this.data.shift?.windowBeforeMin ?? 30],
    windowAfterMin: [this.data.shift?.windowAfterMin ?? 30],
  });

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const request: ShiftRequest = this.form.getRawValue();
    this.saving.set(true);
    this.problem.set(null);
    const request$ = this.data.shift
      ? this.service.updateShift(this.data.shift.id, request)
      : this.service.createShift(this.data.scheduleId, request);
    request$.subscribe({
      next: () => this.ref.close(true),
      error: (err) => {
        this.saving.set(false);
        this.problem.set(localizedProblem(this.transloco, err, 'scheduling.shiftSaveError'));
      },
    });
  }
}
