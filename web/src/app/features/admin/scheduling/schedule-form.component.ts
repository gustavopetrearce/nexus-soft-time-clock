import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';

import { BreadcrumbComponent } from '../../../core/ui/breadcrumb.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { StatusChipComponent } from '../../../core/ui/status-chip.component';
import { SCHEDULE_STATUSES, Schedule } from './scheduling.models';
import { SchedulingService } from './scheduling.service';

/** Alta / edición de horario en página completa (con breadcrumb). Turnos y asignaciones se gestionan desde el listado. */
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
    MatProgressBarModule,
    MatSelectModule,
    BreadcrumbComponent,
    PageHeaderComponent,
    StatusChipComponent,
  ],
  template: `
    <app-breadcrumb
      [items]="[
        { label: 'Planificación', route: '/scheduling' },
        { label: 'Horarios y turnos', route: '/scheduling' },
        { label: isEdit() ? (schedule()?.name ?? '') : 'Nuevo horario' },
      ]"
    />
    <app-page-header [title]="isEdit() ? 'Editar horario' : 'Nuevo horario'" />

    @if (loading()) { <mat-progress-bar mode="indeterminate" style="margin-bottom:16px" /> }
    @if (error()) { <p class="error-text">{{ error() }}</p> }

    <div class="form-page-layout">
      <div class="form-page-main">
        <h3 class="form-section-title">Información del horario</h3>
        <form [formGroup]="form">
          <div class="form-grid-2">
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>Código</mat-label>
              <input matInput formControlName="code" />
              <mat-hint>Código único que identifica al horario.</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>Nombre</mat-label>
              <input matInput formControlName="name" />
              <mat-hint>Nombre con el que se identifica el horario.</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>Zona horaria</mat-label>
              <input matInput formControlName="timezone" placeholder="America/Lima" />
              <mat-hint>
                Zona IANA en la que se interpretan las horas de los turnos de este horario. Dejarla en
                blanco hace que se hereden del centro de trabajo o de la empresa.
              </mat-hint>
            </mat-form-field>
            @if (isEdit()) {
              <mat-form-field appearance="outline" class="drawer-field">
                <mat-label>Estado</mat-label>
                <mat-select formControlName="status">
                  @for (s of statuses; track s) { <mat-option [value]="s">{{ s }}</mat-option> }
                </mat-select>
                <mat-hint>Solo los horarios activos pueden asignarse.</mat-hint>
              </mat-form-field>
            }
          </div>
        </form>

        <div class="form-actions">
          <button mat-button type="button" (click)="cancel()">Cancelar</button>
          <button mat-flat-button color="primary" [disabled]="!formValid() || saving()" (click)="save()">
            <mat-icon>save</mat-icon> {{ isEdit() ? 'Guardar cambios' : 'Guardar horario' }}
          </button>
        </div>
      </div>

      <div class="form-page-side">
        <div class="info-card tip">
          <h3 class="info-card-title">Información importante</h3>
          <div class="icon-row">
            <mat-icon>schedule</mat-icon>
            <div>
              <p class="row-title">¿Qué es un horario?</p>
              <p class="row-desc">Agrupa los turnos que luego se asignan a los colaboradores.</p>
            </div>
          </div>
          <div class="icon-row">
            <mat-icon>badge</mat-icon>
            <div>
              <p class="row-title">Código único</p>
              <p class="row-desc">El código de horario no puede modificarse después de crearlo.</p>
            </div>
          </div>
        </div>

        @if (isEdit() && schedule(); as s) {
          <div class="info-card">
            <div class="entity-avatar-row">
              <div class="entity-avatar"><mat-icon>calendar_month</mat-icon></div>
              <div>
                <p class="entity-avatar-name">{{ s.name }}</p>
                <app-status-chip [status]="s.status" />
              </div>
            </div>
            <div class="info-row"><span class="k">Código</span><span class="v">{{ s.code }}</span></div>
          </div>
          <div class="info-card">
            <h3 class="info-card-title">Turnos y asignaciones</h3>
            <p class="muted" style="margin:0 0 var(--sp-3)">Los turnos y asignaciones de este horario se gestionan desde el listado.</p>
            <a mat-stroked-button [routerLink]="['/scheduling']">
              <mat-icon>schedule</mat-icon> Ir al listado
            </a>
          </div>
        }
      </div>
    </div>
  `,
})
export class ScheduleFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(SchedulingService);
  private readonly notify = inject(NotificationService);

  protected readonly statuses = SCHEDULE_STATUSES;
  protected readonly scheduleId = this.route.snapshot.paramMap.get('id');
  protected readonly isEdit = computed(() => !!this.scheduleId);

  protected readonly schedule = signal<Schedule | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required]],
    name: ['', [Validators.required]],
    // Se precarga la zona del navegador: dejarla en blanco delega en el centro o la empresa, y un
    // horario sin zona en ninguno de los tres niveles acaba evaluando las horas de sus turnos en UTC.
    timezone: [browserTimeZone(), [Validators.required]],
    status: ['ACTIVE'],
  });

  private readonly formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  protected readonly formValid = computed(() => this.formStatus() === 'VALID');

  constructor() {
    if (this.scheduleId) {
      this.loading.set(true);
      this.service.getSchedule(this.scheduleId).subscribe({
        next: (s) => {
          this.schedule.set(s);
          this.form.reset({
            code: s.code,
            name: s.name,
            timezone: s.timezone || browserTimeZone(),
            status: s.status,
          });
          this.form.controls.code.disable();
          this.loading.set(false);
        },
        error: () => {
          this.error.set('No se pudo cargar el horario.');
          this.loading.set(false);
        },
      });
    }
  }

  protected cancel(): void {
    void this.router.navigate(['/scheduling']);
  }

  protected save(): void {
    if (this.form.invalid) {
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    const request$ = this.scheduleId
      ? this.service.updateSchedule(this.scheduleId, {
          name: raw.name,
          timezone: raw.timezone || undefined,
          status: raw.status as Schedule['status'],
        })
      : this.service.createSchedule({ code: raw.code, name: raw.name, timezone: raw.timezone || undefined });
    request$.subscribe({
      next: () => {
        this.notify.success(this.scheduleId ? 'Horario actualizado.' : 'Horario creado.');
        void this.router.navigate(['/scheduling']);
      },
      error: () => {
        this.saving.set(false);
        this.notify.error('No se pudo guardar el horario.');
      },
    });
  }
}

/** Zona IANA del navegador, o UTC si el entorno no la expone. */
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
