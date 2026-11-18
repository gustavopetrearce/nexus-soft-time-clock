import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Observable, concat, last, of } from 'rxjs';

import { browserTimeZone, timezoneOptions } from '../../../core/models/timezones';
import { AlertComponent } from '../../../core/ui/alert.component';
import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { localizedProblem } from '../../../core/ui/problem-detail';
import { ScrollDirective } from '../../../core/ui/scroll.directive';
import { SCHEDULE_STATUSES, Schedule, Shift, ShiftRequest } from './scheduling.models';
import { SchedulingService } from './scheduling.service';

export interface ScheduleDrawerData {
  /** Horario a editar; sin él, se crea uno nuevo. */
  scheduleId: string | null;
}

/** Turno desplegado en el acordeón: uno existente (por id) o el nuevo que se está agregando. */
type OpenShift = string | 'new' | null;

/**
 * P29 · Nuevo o editar horario (Drawer sobre P28, HIFI/03 F): código, nombre, zona horaria
 * (obligatoria, precargada del navegador) y estado en 2 columnas. Al editar, los turnos van en
 * Lista en acordeón (DS/10 patrón 2): plegados muestran el resumen; desplegado, el formulario del
 * turno; uno a la vez. «Guardar» guarda el horario y el turno desplegado, cierra y avisa.
 * El backend no expone borrado de turnos, así que no hay «Quitar».
 */
@Component({
  selector: 'app-schedule-form',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    TranslocoPipe,
    AlertComponent,
    EmptyStateComponent,
    LoadingBarComponent,
    ScrollDirective,
  ],
  styles: [
    `
      h2, h3 { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      .nx-acordeon__cuerpo { display: block; }
      .nx-capa__pie .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
      .turnos { display: flex; flex-direction: column; gap: var(--nx-space-gap-related); }
      .turnos > button { align-self: flex-start; }
    `,
  ],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3" mat-dialog-title>{{ (isEdit ? 'scheduling.edit' : 'scheduling.new') | transloco }}</h2>
      <button mat-icon-button type="button" mat-dialog-close [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
    </div>

    <form class="nx-capa__cuerpo nx-scroll" nxScroll id="horario" [formGroup]="form" (ngSubmit)="save()" novalidate aria-live="polite">
      <app-loading-bar [active]="loading()" />
      @if (error()) {
        <app-empty-state tone="error" [message]="'scheduling.form.loadError' | transloco" [description]="'common.loadErrorHint' | transloco" />
      } @else {
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
          @if (isEdit) {
            <mat-form-field appearance="outline">
              <mat-label>{{ 'common.status' | transloco }}</mat-label>
              <mat-select formControlName="status">
                @for (s of statuses; track s) { <mat-option [value]="s">{{ 'status.' + s | transloco }}</mat-option> }
              </mat-select>
            </mat-form-field>
          }
        </div>

        @if (isEdit) {
          <div class="turnos">
            <h3 class="nx-text-heading-4 nx-form__seccion">{{ 'scheduling.shifts' | transloco }}</h3>
            @if (shifts().length === 0 && openShift() !== 'new') {
              <app-empty-state icon="schedule" [message]="'scheduling.noShifts' | transloco" />
            }
            @if (shifts().length > 0 || openShift() === 'new') {
              <ul class="nx-acordeon">
                @for (s of shifts(); track s.id) {
                  <li [class.is-open]="openShift() === s.id">
                    <ng-container *ngTemplateOutlet="cabecera; context: { $implicit: s, open: openShift() === s.id }" />
                    @if (openShift() === s.id) { <ng-container *ngTemplateOutlet="cuerpo" /> }
                  </li>
                }
                @if (openShift() === 'new') {
                  <li class="is-open">
                    <div class="nx-acordeon__cab">
                      <div class="nx-acordeon__txt"><span class="nx-acordeon__tit"><b>{{ 'scheduling.newShift' | transloco }}</b></span></div>
                      <button mat-icon-button type="button" (click)="toggle(null)" [attr.aria-label]="'scheduling.collapseShift' | transloco"><mat-icon>close</mat-icon></button>
                    </div>
                    <ng-container *ngTemplateOutlet="cuerpo" />
                  </li>
                }
              </ul>
            }
            @if (openShift() !== 'new') {
              <button mat-stroked-button type="button" (click)="toggle('new')"><mat-icon>add</mat-icon>{{ 'scheduling.addShift' | transloco }}</button>
            }
          </div>
        }
      }
    </form>

    <ng-template #cabecera let-s let-open="open">
      <div class="nx-acordeon__cab">
        <div class="nx-acordeon__txt">
          <span class="nx-acordeon__tit">
            <b>{{ s.name }}</b>
            <span class="nx-text-numeric">{{ s.startTime.substring(0, 5) }}–{{ s.endTime.substring(0, 5) }}</span>
            @if (s.crossesMidnight) { <span class="nx-chip nx-chip--info">{{ 'scheduling.crossesMidnight' | transloco }}</span> }
          </span>
          <span class="nx-acordeon__res nx-text-numeric">
            {{ 'scheduling.break' | transloco }} {{ s.breakMinutes }} min ·
            {{ 'scheduling.tolerances' | transloco }} {{ s.lateToleranceMin }} / {{ s.earlyToleranceMin }} min ·
            {{ 'scheduling.windows' | transloco }} {{ s.windowBeforeMin }} / {{ s.windowAfterMin }} min
          </span>
        </div>
        <button
          mat-icon-button
          type="button"
          (click)="toggle(open ? null : s.id)"
          [attr.aria-expanded]="open"
          [attr.aria-label]="(open ? 'scheduling.collapseShift' : 'scheduling.editShiftOf') | transloco: { name: s.name }"
        >
          <mat-icon>{{ open ? 'close' : 'edit' }}</mat-icon>
        </button>
      </div>
    </ng-template>

    <ng-template #cuerpo>
      <div class="nx-acordeon__cuerpo" [formGroup]="shiftForm">
        <div class="nx-form__grid">
          <mat-form-field appearance="outline" class="nx-campo--ancho">
            <mat-label>{{ 'common.name' | transloco }}</mat-label>
            <input matInput formControlName="name" required autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'scheduling.shiftStart' | transloco }}</mat-label>
            <input matInput type="time" formControlName="startTime" required />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'scheduling.shiftEnd' | transloco }}</mat-label>
            <input matInput type="time" formControlName="endTime" required />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'scheduling.breakMinutes' | transloco }}</mat-label>
            <input matInput type="number" min="0" formControlName="breakMinutes" />
          </mat-form-field>
          <mat-slide-toggle formControlName="crossesMidnight">{{ 'scheduling.crossesMidnight' | transloco }}</mat-slide-toggle>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'scheduling.lateTolerance' | transloco }}</mat-label>
            <input matInput type="number" min="0" formControlName="lateToleranceMin" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'scheduling.earlyTolerance' | transloco }}</mat-label>
            <input matInput type="number" min="0" formControlName="earlyToleranceMin" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'scheduling.windowBefore' | transloco }}</mat-label>
            <input matInput type="number" min="0" formControlName="windowBeforeMin" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'scheduling.windowAfter' | transloco }}</mat-label>
            <input matInput type="number" min="0" formControlName="windowAfterMin" />
          </mat-form-field>
        </div>
      </div>
    </ng-template>

    <div class="nx-capa__pie">
      <button mat-button type="button" mat-dialog-close><mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button type="submit" form="horario" [disabled]="saving()" [attr.aria-busy]="saving()">
        @if (saving()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>save</mat-icon> }
        {{ 'common.save' | transloco }}
      </button>
    </div>
  `,
})
export class ScheduleFormComponent {
  private readonly data = inject<ScheduleDrawerData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ScheduleFormComponent, boolean>>(MatDialogRef);
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SchedulingService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);

  protected readonly statuses = SCHEDULE_STATUSES;
  protected readonly isEdit = !!this.data.scheduleId;

  protected readonly schedule = signal<Schedule | null>(null);
  protected readonly shifts = signal<Shift[]>([]);
  protected readonly openShift = signal<OpenShift>(null);
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

  /** Formulario del turno desplegado; ventanas de 30 min por defecto (RN-15). */
  protected readonly shiftForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    startTime: ['08:00', Validators.required],
    endTime: ['16:00', Validators.required],
    crossesMidnight: [false],
    breakMinutes: [60],
    lateToleranceMin: [10],
    earlyToleranceMin: [10],
    windowBeforeMin: [30],
    windowAfterMin: [30],
  });

  constructor() {
    const id = this.data.scheduleId;
    if (!id) return;
    this.loading.set(true);
    this.service.getSchedule(id).subscribe({
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
    this.service.listShifts(id).subscribe({
      next: (list) => this.shifts.set([...list].sort((a, b) => a.name.localeCompare(b.name, 'es'))),
      error: () => this.notify.error(this.transloco.translate('scheduling.shiftsError')),
    });
  }

  /** Despliega un turno (o el nuevo) y pliega el anterior, sin aviso por cambios sin guardar (C6). */
  protected toggle(target: OpenShift): void {
    const shift = this.shifts().find((s) => s.id === target);
    this.shiftForm.reset(
      shift
        ? {
            name: shift.name,
            startTime: shift.startTime.substring(0, 5),
            endTime: shift.endTime.substring(0, 5),
            crossesMidnight: shift.crossesMidnight,
            breakMinutes: shift.breakMinutes,
            lateToleranceMin: shift.lateToleranceMin,
            earlyToleranceMin: shift.earlyToleranceMin,
            windowBeforeMin: shift.windowBeforeMin,
            windowAfterMin: shift.windowAfterMin,
          }
        : undefined,
    );
    this.openShift.set(target);
  }

  protected save(): void {
    const withShift = this.openShift() !== null;
    if (this.form.invalid || (withShift && this.shiftForm.invalid)) {
      this.form.markAllAsTouched();
      this.shiftForm.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.problem.set(null);
    const id = this.data.scheduleId;
    if (!id) {
      this.service.createSchedule({ code: raw.code, name: raw.name, timezone: raw.timezone || undefined }).subscribe({
        next: () => this.done('scheduling.form.created'),
        error: (err) => this.fail(err, 'scheduling.form.saveError'),
      });
      return;
    }
    const steps: Observable<unknown>[] = [
      this.service.updateSchedule(id, { name: raw.name, timezone: raw.timezone || undefined, status: raw.status as Schedule['status'] }),
    ];
    if (withShift) steps.push(this.saveShift(id));
    concat(...steps, of(null))
      .pipe(last())
      .subscribe({
        next: () => this.done('scheduling.form.updated'),
        error: (err) => this.fail(err, 'scheduling.form.saveError'),
      });
  }

  private saveShift(scheduleId: string): Observable<Shift> {
    const request: ShiftRequest = this.shiftForm.getRawValue();
    const open = this.openShift();
    return open === 'new' || open === null
      ? this.service.createShift(scheduleId, request)
      : this.service.updateShift(open, request);
  }

  private done(messageKey: string): void {
    this.notify.success(this.transloco.translate(messageKey));
    this.ref.close(true);
  }

  private fail(err: unknown, fallbackKey: string): void {
    this.saving.set(false);
    this.problem.set(localizedProblem(this.transloco, err, fallbackKey));
  }
}
