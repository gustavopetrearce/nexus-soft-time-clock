import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';

import { AppDatePipe } from '../../../core/i18n/app-date.pipe';
import { AlertComponent } from '../../../core/ui/alert.component';
import { debouncedSearch } from '../../../core/ui/catalog';
import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { localizedProblem } from '../../../core/ui/problem-detail';
import { ScrollDirective } from '../../../core/ui/scroll.directive';
import { User } from '../users/user.models';
import { UserService } from '../users/user.service';
import { WorkSite } from '../work-sites/work-site.models';
import { WorkSiteService } from '../work-sites/work-site.service';
import { Assignment, Schedule, Shift } from './scheduling.models';
import { SchedulingService } from './scheduling.service';

export interface AssignShiftData {
  schedules: Schedule[];
}

/** Turno con el nombre de su horario, para el selector y la lista de asignaciones. */
interface ShiftOption extends Shift {
  scheduleName: string;
}

/**
 * P30 · Asignar turno (drawer): colaborador (buscado en el servidor), turno de cualquier horario,
 * centro opcional y vigencia; el fin es opcional y no puede ser anterior al inicio. Debajo se ven
 * las asignaciones del colaborador elegido.
 */
@Component({
  selector: 'app-assign-shift-drawer',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    TranslocoPipe,
    AppDatePipe,
    AlertComponent,
    EmptyStateComponent,
    LoadingBarComponent,
    ScrollDirective,
  ],
  styles: [
    `
      h2, h3, ul { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      .nx-capa__pie .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
    `,
  ],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3" mat-dialog-title>{{ 'scheduling.assignShift' | transloco }}</h2>
      <button mat-icon-button type="button" mat-dialog-close [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
    </div>

    <form class="nx-capa__cuerpo nx-scroll" nxScroll id="asignar-turno" [formGroup]="form" (ngSubmit)="save()" novalidate aria-live="polite">
      <app-loading-bar [active]="loading()" />
      @if (rangeInvalid()) { <app-alert tone="error">{{ 'scheduling.rangeInvalid' | transloco }}</app-alert> }
      @if (problem()) { <app-alert tone="error">{{ problem() }}</app-alert> }

      <mat-form-field appearance="outline">
        <mat-label>{{ 'scheduling.searchCollaborator' | transloco }}</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput type="search" [formControl]="userSearch" autocomplete="off" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>{{ 'scheduling.collaborator' | transloco }}</mat-label>
        <mat-select formControlName="userId" required>
          @for (u of users(); track u.id) {
            <mat-option [value]="u.id">{{ u.firstName }} {{ u.lastName }}@if (u.employeeCode) { · {{ u.employeeCode }} }</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>{{ 'scheduling.shift' | transloco }}</mat-label>
        <mat-select formControlName="shiftId" required>
          @for (s of shiftOptions(); track s.id) {
            <mat-option [value]="s.id">{{ s.scheduleName }} · {{ s.name }} {{ s.startTime.substring(0, 5) }}–{{ s.endTime.substring(0, 5) }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>{{ 'scheduling.siteOptional' | transloco }}</mat-label>
        <mat-select formControlName="workSiteId">
          <mat-option [value]="''">—</mat-option>
          @for (w of workSites(); track w.id) { <mat-option [value]="w.id">{{ w.name }}</mat-option> }
        </mat-select>
      </mat-form-field>
      <div class="nx-form__grid">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'period.from' | transloco }}</mat-label>
          <input matInput type="date" formControlName="validFrom" required />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'scheduling.toOptional' | transloco }}</mat-label>
          <input matInput type="date" formControlName="validTo" />
        </mat-form-field>
      </div>

      <h3 class="nx-text-heading-4">{{ 'scheduling.assignments' | transloco }}</h3>
      @if (!form.controls.userId.value) {
        <app-empty-state icon="person" [message]="'scheduling.pickUser' | transloco" />
      } @else if (assignments().length === 0) {
        <p class="nx-text-small nx-sec">{{ 'scheduling.noAssignments' | transloco }}</p>
      } @else {
        <ul class="nx-lista">
          @for (a of assignments(); track a.id) {
            <li class="nx-lista__fila">
              <div class="nx-lista__texto">
                <span>{{ shiftLabel(a.shiftId) }}</span>
                <span class="nx-lista__secundario">
                  {{ siteLabel(a.workSiteId) }} ·
                  <span class="nx-text-numeric">{{ a.validFrom | appDate: 'dd/MM/yyyy' }} → {{ a.validTo ? (a.validTo | appDate: 'dd/MM/yyyy') : '—' }}</span>
                </span>
              </div>
            </li>
          }
        </ul>
      }
    </form>

    <div class="nx-capa__pie">
      <button mat-button type="button" mat-dialog-close><mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button type="submit" form="asignar-turno" [disabled]="saving()" [attr.aria-busy]="saving()">
        @if (saving()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>save</mat-icon> }
        {{ 'common.save' | transloco }}
      </button>
    </div>
  `,
})
export class AssignShiftDrawerComponent {
  private readonly data = inject<AssignShiftData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<AssignShiftDrawerComponent, boolean>>(MatDialogRef);
  private readonly service = inject(SchedulingService);
  private readonly userService = inject(UserService);
  private readonly workSiteService = inject(WorkSiteService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly users = signal<User[]>([]);
  protected readonly workSites = signal<WorkSite[]>([]);
  protected readonly shiftOptions = signal<ShiftOption[]>([]);
  protected readonly assignments = signal<Assignment[]>([]);

  protected readonly userSearch = this.fb.nonNullable.control('');
  protected readonly form = this.fb.nonNullable.group({
    userId: ['', Validators.required],
    shiftId: ['', Validators.required],
    workSiteId: [''],
    validFrom: ['', Validators.required],
    validTo: [''],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  /** Fin vacío o igual o posterior al inicio (HIFI/08 R4). */
  protected readonly rangeInvalid = computed(() => {
    const { validFrom, validTo } = this.value();
    return !!validFrom && !!validTo && validTo < validFrom;
  });

  constructor() {
    debouncedSearch(this.userSearch.valueChanges)
      .pipe(
        switchMap((term) => this.userService.list(0, 50, term.trim() || undefined).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(),
      )
      .subscribe((page) => page && this.users.set(page.content));
    this.form.controls.userId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => this.loadAssignments(id));

    forkJoin({
      users: this.userService.list(0, 50),
      sites: this.workSiteService.list(0, 200),
      // forkJoin de una lista vacía no emite: sin horarios no hay turnos que pedir.
      shifts: this.data.schedules.length
        ? forkJoin(
            this.data.schedules.map((s) =>
              this.service.listShifts(s.id).pipe(
                map((list) => list.map((shift) => ({ ...shift, scheduleName: s.name }))),
                catchError(() => of([] as ShiftOption[])),
              ),
            ),
          ).pipe(map((lists) => lists.flat()))
        : of([] as ShiftOption[]),
    }).subscribe({
      next: ({ users, sites, shifts }) => {
        this.users.set(users.content);
        this.workSites.set(sites.content);
        this.shiftOptions.set(shifts);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.problem.set(localizedProblem(this.transloco, err, 'common.loadError'));
      },
    });
  }

  private loadAssignments(userId: string): void {
    this.assignments.set([]);
    if (!userId) return;
    this.service.listAssignments(userId).subscribe({
      next: (list) => this.assignments.set(list),
      error: () => this.notify.error(this.transloco.translate('scheduling.assignmentsError')),
    });
  }

  protected shiftLabel(shiftId: string): string {
    const s = this.shiftOptions().find((o) => o.id === shiftId);
    return s ? `${s.scheduleName} · ${s.name} (${s.startTime.substring(0, 5)}–${s.endTime.substring(0, 5)})` : shiftId;
  }

  protected siteLabel(workSiteId?: string): string {
    return (workSiteId && this.workSites().find((w) => w.id === workSiteId)?.name) || '—';
  }

  protected save(): void {
    if (this.form.invalid || this.rangeInvalid()) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.problem.set(null);
    this.service
      .assign({
        userId: raw.userId,
        shiftId: raw.shiftId,
        workSiteId: raw.workSiteId || undefined,
        validFrom: raw.validFrom,
        validTo: raw.validTo || undefined,
      })
      .subscribe({
        next: () => {
          this.notify.success(this.transloco.translate('scheduling.assignmentCreated'));
          this.ref.close(true);
        },
        error: (err) => {
          this.saving.set(false);
          this.problem.set(localizedProblem(this.transloco, err, 'scheduling.assignmentError'));
        },
      });
  }
}
