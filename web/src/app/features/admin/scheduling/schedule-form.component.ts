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
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { BreadcrumbComponent } from '../../../core/ui/breadcrumb.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { StatusChipComponent } from '../../../core/ui/status-chip.component';
import { browserTimeZone, timezoneOptions } from '../../../core/models/timezones';
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
    TranslocoPipe,
  ],
  template: `
    <app-breadcrumb
      [items]="[
        { label: ('layout.group.planning' | transloco), route: '/scheduling' },
        { label: ('layout.nav.scheduling' | transloco), route: '/scheduling' },
        { label: isEdit() ? (schedule()?.name ?? '') : ('scheduling.new' | transloco) },
      ]"
    />
    <app-page-header [title]="(isEdit() ? 'scheduling.edit' : 'scheduling.new') | transloco" />

    @if (loading()) { <mat-progress-bar mode="indeterminate" style="margin-bottom:16px" /> }
    @if (error()) { <p class="error-text">{{ error() }}</p> }

    <div class="form-page-layout">
      <div class="form-page-main">
        <h3 class="form-section-title">{{ 'scheduling.form.info' | transloco }}</h3>
        <form [formGroup]="form">
          <div class="form-grid-2">
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>{{ 'common.code' | transloco }}</mat-label>
              <input matInput formControlName="code" />
              <mat-hint>{{ 'scheduling.form.codeHint' | transloco }}</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>{{ 'common.name' | transloco }}</mat-label>
              <input matInput formControlName="name" />
              <mat-hint>{{ 'scheduling.form.nameHint' | transloco }}</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>{{ 'companies.form.timezone' | transloco }}</mat-label>
              <mat-select formControlName="timezone">
                @for (tz of tzOptions(); track tz.value) {
                  <mat-option [value]="tz.value">{{ tz.label }}</mat-option>
                }
              </mat-select>
              <mat-hint>{{ 'scheduling.form.timezoneHint' | transloco }}</mat-hint>
            </mat-form-field>
            @if (isEdit()) {
              <mat-form-field appearance="outline" class="drawer-field">
                <mat-label>{{ 'common.status' | transloco }}</mat-label>
                <mat-select formControlName="status">
                  @for (s of statuses; track s) { <mat-option [value]="s">{{ 'status.' + s | transloco }}</mat-option> }
                </mat-select>
                <mat-hint>{{ 'scheduling.form.statusHint' | transloco }}</mat-hint>
              </mat-form-field>
            }
          </div>
        </form>

        <div class="form-actions">
          <button mat-button type="button" (click)="cancel()">{{ 'common.cancel' | transloco }}</button>
          <button mat-flat-button color="primary" [disabled]="!formValid() || saving()" (click)="save()">
            <mat-icon>save</mat-icon> {{ (isEdit() ? 'common.saveChanges' : 'scheduling.form.save') | transloco }}
          </button>
        </div>
      </div>

      <div class="form-page-side">
        <div class="info-card tip">
          <h3 class="info-card-title">{{ 'companies.form.importantInfo' | transloco }}</h3>
          <div class="icon-row">
            <mat-icon>schedule</mat-icon>
            <div>
              <p class="row-title">{{ 'scheduling.form.whatIs' | transloco }}</p>
              <p class="row-desc">{{ 'scheduling.form.whatIsText' | transloco }}</p>
            </div>
          </div>
          <div class="icon-row">
            <mat-icon>badge</mat-icon>
            <div>
              <p class="row-title">{{ 'companies.form.uniqueCode' | transloco }}</p>
              <p class="row-desc">{{ 'scheduling.form.uniqueCodeText' | transloco }}</p>
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
            <div class="info-row"><span class="k">{{ 'common.code' | transloco }}</span><span class="v">{{ s.code }}</span></div>
          </div>
          <div class="info-card">
            <h3 class="info-card-title">{{ 'scheduling.form.shiftsTitle' | transloco }}</h3>
            <p class="muted" style="margin:0 0 var(--nx-space-3)">{{ 'scheduling.form.shiftsText' | transloco }}</p>
            <a mat-stroked-button [routerLink]="['/scheduling']">
              <mat-icon>schedule</mat-icon> {{ 'scheduling.form.goToList' | transloco }}
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
  private readonly transloco = inject(TranslocoService);

  protected readonly statuses = SCHEDULE_STATUSES;
  protected readonly scheduleId = this.route.snapshot.paramMap.get('id');
  protected readonly isEdit = computed(() => !!this.scheduleId);

  protected readonly schedule = signal<Schedule | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** La lista es curada; se añade la zona guardada —o la precargada del navegador— si no está en ella. */
  protected readonly tzOptions = computed(() =>
    timezoneOptions(this.schedule()?.timezone || browserTimeZone()),
  );

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
          this.error.set(this.transloco.translate('scheduling.form.loadError'));
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
        this.notify.success(this.transloco.translate(this.scheduleId ? 'scheduling.form.updated' : 'scheduling.form.created'));
        void this.router.navigate(['/scheduling']);
      },
      error: () => {
        this.saving.set(false);
        this.notify.error(this.transloco.translate('scheduling.form.saveError'));
      },
    });
  }
}
