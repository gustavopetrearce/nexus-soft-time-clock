import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { browserTimeZone, timezoneOptions } from '../../../core/models/timezones';
import { AlertComponent } from '../../../core/ui/alert.component';
import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { localizedProblem } from '../../../core/ui/problem-detail';
import { ScrollDirective } from '../../../core/ui/scroll.directive';
import { SCHEDULE_STATUSES, Schedule, Shift } from './scheduling.models';
import { SchedulingService } from './scheduling.service';
import { ShiftDialogComponent, ShiftDialogData } from './shift-dialog.component';

/**
 * P29 · Nuevo o editar horario (página, patrón Formulario): código y nombre obligatorios, zona horaria
 * (precargada del navegador) y estado; debajo, la tabla de turnos con «Agregar turno». Al crear se
 * pasa a la edición del horario recién guardado para poder darle turnos.
 */
@Component({
  selector: 'app-schedule-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    TranslocoPipe,
    AlertComponent,
    EmptyStateComponent,
    LoadingBarComponent,
    ScrollDirective,
  ],
  styles: [
    `
      h1, h2 { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      td { white-space: nowrap; }
      .encabezado { display: flex; align-items: center; justify-content: space-between; gap: var(--nx-space-gap-related); }
      .nx-form__acciones .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
    `,
  ],
  template: `
    <div class="nx-regresar">
      <a mat-button routerLink="/scheduling"><mat-icon>arrow_back</mat-icon>{{ 'common.back' | transloco }}</a>
    </div>
    <app-loading-bar [active]="loading()" />

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco" />
    } @else {
      <form class="nx-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <h1 class="nx-text-heading-1">{{ (isEdit() ? 'scheduling.edit' : 'scheduling.new') | transloco }}</h1>
        @if (problem()) { <app-alert tone="error">{{ problem() }}</app-alert> }

        <div class="nx-form__grid">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'common.code' | transloco }}</mat-label>
            <input matInput formControlName="code" required autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'common.name' | transloco }}</mat-label>
            <input matInput formControlName="name" required autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'companies.form.timezone' | transloco }}</mat-label>
            <mat-select formControlName="timezone" required>
              @for (tz of tzOptions(); track tz.value) { <mat-option [value]="tz.value">{{ tz.label }}</mat-option> }
            </mat-select>
          </mat-form-field>
          @if (isEdit()) {
            <mat-form-field appearance="outline">
              <mat-label>{{ 'common.status' | transloco }}</mat-label>
              <mat-select formControlName="status">
                @for (s of statuses; track s) { <mat-option [value]="s">{{ 'status.' + s | transloco }}</mat-option> }
              </mat-select>
            </mat-form-field>
          }
        </div>

        @if (isEdit()) {
          <div class="encabezado">
            <h2 class="nx-text-heading-3">{{ 'scheduling.shifts' | transloco }}</h2>
            @if (shifts().length > 0) {
              <button mat-stroked-button type="button" (click)="openShift()"><mat-icon>add</mat-icon>{{ 'scheduling.addShift' | transloco }}</button>
            }
          </div>
          @if (shifts().length === 0) {
            <app-empty-state icon="schedule" [message]="'scheduling.noShifts' | transloco">
              <button mat-stroked-button type="button" (click)="openShift()"><mat-icon>add</mat-icon>{{ 'scheduling.addShift' | transloco }}</button>
            </app-empty-state>
          } @else {
            <div class="nx-tabla">
              <div class="nx-tabla__scroll nx-scroll" nxScroll>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{{ 'common.name' | transloco }}</th>
                      <th scope="col">{{ 'scheduling.start' | transloco }}</th>
                      <th scope="col">{{ 'scheduling.end' | transloco }}</th>
                      <th scope="col">{{ 'scheduling.crossesMidnight' | transloco }}</th>
                      <th scope="col" class="num">{{ 'scheduling.break' | transloco }}</th>
                      <th scope="col" class="num">{{ 'scheduling.tolerances' | transloco }}</th>
                      <th scope="col" class="num">{{ 'scheduling.windows' | transloco }}</th>
                      <th scope="col" class="nx-col-acciones">{{ 'common.actions' | transloco }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (s of shifts(); track s.id) {
                      <tr>
                        <td>{{ s.name }}</td>
                        <td class="nx-text-numeric">{{ s.startTime.substring(0, 5) }}</td>
                        <td class="nx-text-numeric">{{ s.endTime.substring(0, 5) }}</td>
                        <td>
                          @if (s.crossesMidnight) { <span class="nx-chip nx-chip--informativo">{{ 'common.yes' | transloco }}</span> }
                          @else { {{ 'common.no' | transloco }} }
                        </td>
                        <td class="num nx-text-numeric">{{ s.breakMinutes }} min</td>
                        <td class="num nx-text-numeric">{{ s.lateToleranceMin }} / {{ s.earlyToleranceMin }} min</td>
                        <td class="num nx-text-numeric">{{ s.windowBeforeMin }} / {{ s.windowAfterMin }} min</td>
                        <td class="nx-col-acciones">
                          <button mat-icon-button type="button" (click)="openShift(s)" [attr.aria-label]="'scheduling.editShiftOf' | transloco: { name: s.name }">
                            <mat-icon>edit</mat-icon>
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        }

        <div class="nx-form__acciones">
          <button mat-button type="button" (click)="cancel()"><mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}</button>
          <button mat-flat-button type="submit" [disabled]="saving()" [attr.aria-busy]="saving()">
            @if (saving()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>save</mat-icon> }
            {{ 'common.save' | transloco }}
          </button>
        </div>
      </form>
    }
  `,
})
export class ScheduleFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(SchedulingService);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly statuses = SCHEDULE_STATUSES;
  protected readonly scheduleId = this.route.snapshot.paramMap.get('id');
  protected readonly isEdit = computed(() => !!this.scheduleId);

  protected readonly schedule = signal<Schedule | null>(null);
  protected readonly shifts = signal<Shift[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal(false);
  protected readonly problem = signal<string | null>(null);

  /** La lista es curada; se añade la zona guardada —o la precargada del navegador— si no está en ella. */
  protected readonly tzOptions = computed(() => timezoneOptions(this.schedule()?.timezone || browserTimeZone()));

  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required]],
    name: ['', [Validators.required]],
    // Se precarga la zona del navegador: dejarla en blanco delega en el centro o la empresa, y un
    // horario sin zona en ninguno de los tres niveles acaba evaluando las horas de sus turnos en UTC.
    timezone: [browserTimeZone(), [Validators.required]],
    status: ['ACTIVE'],
  });

  constructor() {
    if (this.scheduleId) {
      this.loading.set(true);
      this.service.getSchedule(this.scheduleId).subscribe({
        next: (s) => {
          this.schedule.set(s);
          this.form.reset({ code: s.code, name: s.name, timezone: s.timezone || browserTimeZone(), status: s.status });
          this.form.controls.code.disable();
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
      this.loadShifts();
    }
  }

  private loadShifts(): void {
    if (!this.scheduleId) return;
    this.service.listShifts(this.scheduleId).subscribe({
      next: (list) => this.shifts.set([...list].sort((a, b) => a.name.localeCompare(b.name, 'es'))),
      error: () => this.notify.error(this.transloco.translate('scheduling.shiftsError')),
    });
  }

  protected openShift(shift?: Shift): void {
    if (!this.scheduleId) return;
    this.dialog
      .open<ShiftDialogComponent, ShiftDialogData, boolean>(ShiftDialogComponent, { data: { scheduleId: this.scheduleId, shift } })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.notify.success(this.transloco.translate(shift ? 'scheduling.shiftUpdated' : 'scheduling.shiftAdded'));
          this.loadShifts();
        }
      });
  }

  protected cancel(): void {
    void this.router.navigate(['/scheduling']);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.problem.set(null);
    if (this.scheduleId) {
      this.service
        .updateSchedule(this.scheduleId, { name: raw.name, timezone: raw.timezone || undefined, status: raw.status as Schedule['status'] })
        .subscribe({
          next: () => {
            this.notify.success(this.transloco.translate('scheduling.form.updated'));
            void this.router.navigate(['/scheduling']);
          },
          error: (err) => this.fail(err),
        });
      return;
    }
    this.service.createSchedule({ code: raw.code, name: raw.name, timezone: raw.timezone || undefined }).subscribe({
      next: (created) => {
        this.notify.success(this.transloco.translate('scheduling.form.created'));
        void this.router.navigate(['/scheduling', created.id, 'edit']);
      },
      error: (err) => this.fail(err),
    });
  }

  private fail(err: unknown): void {
    this.saving.set(false);
    this.problem.set(localizedProblem(this.transloco, err, 'scheduling.form.saveError'));
  }
}
