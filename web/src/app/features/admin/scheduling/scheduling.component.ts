import { Component, inject, signal } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';

import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { StatusChipComponent } from '../../../core/ui/status-chip.component';
import { User } from '../users/user.models';
import { UserService } from '../users/user.service';
import { WorkSite } from '../work-sites/work-site.models';
import { WorkSiteService } from '../work-sites/work-site.service';
import { Assignment, Schedule, Shift } from './scheduling.models';
import { SchedulingService } from './scheduling.service';

/** Administración de horarios, turnos y asignaciones (RF-08). Requiere {@code schedule:manage}. */
@Component({
  selector: 'app-scheduling',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    PageHeaderComponent,
    StatusChipComponent,
    EmptyStateComponent,
  ],
  template: `
    <app-page-header title="Horarios y turnos" subtitle="Define y administra los horarios y turnos utilizados por los colaboradores">
      <button mat-flat-button color="primary" (click)="router.navigate(['/scheduling/new'])">
        <mat-icon>add</mat-icon> Nuevo horario
      </button>
    </app-page-header>
    @if (error()) { <p class="error-text">{{ error() }}</p> }

    <mat-tab-group>
      <mat-tab label="Horarios y turnos">
        <div class="split-layout" style="margin-top:16px">
          <div class="split-main">
            <mat-card>
              <mat-card-content>
                <div class="table-wrap">
                  <table mat-table [dataSource]="schedules()" style="width:100%">
                    <ng-container matColumnDef="code">
                      <th mat-header-cell *matHeaderCellDef>Código</th>
                      <td mat-cell *matCellDef="let s">{{ s.code }}</td>
                    </ng-container>
                    <ng-container matColumnDef="name">
                      <th mat-header-cell *matHeaderCellDef>Nombre</th>
                      <td mat-cell *matCellDef="let s">{{ s.name }}</td>
                    </ng-container>
                    <ng-container matColumnDef="status">
                      <th mat-header-cell *matHeaderCellDef>Estado</th>
                      <td mat-cell *matCellDef="let s"><app-status-chip [status]="s.status" /></td>
                    </ng-container>
                    <ng-container matColumnDef="actions">
                      <th mat-header-cell *matHeaderCellDef></th>
                      <td mat-cell *matCellDef="let s" style="text-align:right;white-space:nowrap">
                        <button mat-icon-button (click)="editSchedule(s); $event.stopPropagation()" aria-label="Editar"><mat-icon>chevron_right</mat-icon></button>
                      </td>
                    </ng-container>
                    <tr mat-header-row *matHeaderRowDef="scheduleColumns"></tr>
                    <tr mat-row *matRowDef="let row; columns: scheduleColumns"
                        (click)="selectSchedule(row)"
                        style="cursor:pointer"
                        [style.background]="row.id === selectedSchedule()?.id ? 'var(--brand-soft)' : ''"></tr>
                  </table>
                </div>
                @if (schedules().length === 0) {
                  <app-empty-state icon="event" message="No hay horarios para mostrar." />
                }
              </mat-card-content>
            </mat-card>

            @if (selectedSchedule(); as sc) {
              <mat-card style="margin-top:16px">
                <mat-card-header><mat-card-title>Turnos de {{ sc.name }}</mat-card-title></mat-card-header>
                <mat-card-content>
                  <form [formGroup]="shiftForm" (ngSubmit)="saveShift()" class="filter-bar" style="align-items:baseline">
                    <mat-form-field appearance="outline" style="width:160px">
                      <mat-label>Nombre</mat-label>
                      <input matInput formControlName="name" />
                    </mat-form-field>
                    <mat-form-field appearance="outline" style="width:120px">
                      <mat-label>Entrada</mat-label>
                      <input matInput type="time" formControlName="startTime" />
                    </mat-form-field>
                    <mat-form-field appearance="outline" style="width:120px">
                      <mat-label>Salida</mat-label>
                      <input matInput type="time" formControlName="endTime" />
                    </mat-form-field>
                    <mat-form-field appearance="outline" style="width:150px">
                      <mat-label>Tolerancia (min)</mat-label>
                      <input matInput type="number" formControlName="lateToleranceMin" />
                      <mat-hint>Margen tras la entrada antes de contar retardo.</mat-hint>
                    </mat-form-field>
                    <mat-form-field appearance="outline" style="width:150px">
                      <mat-label>Ventana antes (min)</mat-label>
                      <input matInput type="number" formControlName="windowBeforeMin" />
                      <mat-hint>Cuánto antes de la entrada se admite marcar.</mat-hint>
                    </mat-form-field>
                    <mat-form-field appearance="outline" style="width:150px">
                      <mat-label>Ventana después (min)</mat-label>
                      <input matInput type="number" formControlName="windowAfterMin" />
                      <mat-hint>Cuánto después de la salida se admite marcar.</mat-hint>
                    </mat-form-field>
                    <mat-checkbox formControlName="crossesMidnight">Cruza medianoche</mat-checkbox>
                    <button mat-flat-button color="primary" type="submit" [disabled]="shiftForm.invalid">
                      {{ editingShiftId() ? 'Guardar' : 'Agregar' }}
                    </button>
                    @if (editingShiftId()) {
                      <button mat-button type="button" (click)="resetShiftForm()">Cancelar</button>
                    }
                  </form>

                  <div class="table-wrap">
                    <table mat-table [dataSource]="shifts()" style="width:100%">
                      <ng-container matColumnDef="name">
                        <th mat-header-cell *matHeaderCellDef>Turno</th>
                        <td mat-cell *matCellDef="let s">{{ s.name }}</td>
                      </ng-container>
                      <ng-container matColumnDef="time">
                        <th mat-header-cell *matHeaderCellDef>Horario</th>
                        <td mat-cell *matCellDef="let s">{{ s.startTime }}–{{ s.endTime }}</td>
                      </ng-container>
                      <ng-container matColumnDef="tolerance">
                        <th mat-header-cell *matHeaderCellDef>Tol.</th>
                        <td mat-cell *matCellDef="let s">{{ s.lateToleranceMin }}m</td>
                      </ng-container>
                      <ng-container matColumnDef="window">
                        <th mat-header-cell *matHeaderCellDef>Ventana</th>
                        <td mat-cell *matCellDef="let s">−{{ s.windowBeforeMin }}m / +{{ s.windowAfterMin }}m</td>
                      </ng-container>
                      <ng-container matColumnDef="actions">
                        <th mat-header-cell *matHeaderCellDef></th>
                        <td mat-cell *matCellDef="let s" style="text-align:right">
                          <button mat-icon-button (click)="editShift(s)" aria-label="Editar"><mat-icon>edit</mat-icon></button>
                        </td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="shiftColumns"></tr>
                      <tr mat-row *matRowDef="let row; columns: shiftColumns"></tr>
                    </table>
                  </div>
                  @if (shifts().length === 0) {
                    <app-empty-state icon="schedule" message="Este horario aún no tiene turnos." />
                  }
                </mat-card-content>
              </mat-card>
            }
          </div>
        </div>
      </mat-tab>

      <!-- Asignaciones -->
      <mat-tab label="Asignaciones">
        <mat-card style="margin-top:16px">
          <mat-card-content>
            <form [formGroup]="assignForm" (ngSubmit)="assign()" class="filter-bar" style="align-items:baseline">
              <mat-form-field appearance="outline" style="width:240px">
                <mat-label>Usuario</mat-label>
                <mat-select formControlName="userId">
                  @for (u of users(); track u.id) {
                    <mat-option [value]="u.id">
                      {{ u.firstName }} {{ u.lastName }}@if (u.employeeCode) { ({{ u.employeeCode }}) }
                    </mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:200px">
                <mat-label>Horario</mat-label>
                <mat-select formControlName="scheduleId"
                            (selectionChange)="onAssignScheduleChange($event.value)">
                  @for (s of schedules(); track s.id) {
                    <mat-option [value]="s.id">{{ s.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:220px">
                <mat-label>Turno</mat-label>
                <mat-select formControlName="shiftId">
                  @for (s of assignShifts(); track s.id) {
                    <mat-option [value]="s.id">{{ s.name }} ({{ s.startTime }}–{{ s.endTime }})</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:220px">
                <mat-label>Centro (opcional)</mat-label>
                <mat-select formControlName="workSiteId">
                  <mat-option [value]="''">—</mat-option>
                  @for (w of workSites(); track w.id) {
                    <mat-option [value]="w.id">{{ w.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:160px">
                <mat-label>Desde</mat-label>
                <input matInput type="date" formControlName="validFrom" />
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:160px">
                <mat-label>Hasta (opcional)</mat-label>
                <input matInput type="date" formControlName="validTo" />
              </mat-form-field>
              <button mat-flat-button color="primary" type="submit" [disabled]="assignForm.invalid">Asignar</button>
            </form>

            <div class="filter-bar">
              <mat-form-field appearance="outline" style="width:280px">
                <mat-label>Listar asignaciones por usuario</mat-label>
                <mat-select [formControl]="lookupUserId">
                  @for (u of users(); track u.id) {
                    <mat-option [value]="u.id">
                      {{ u.firstName }} {{ u.lastName }}@if (u.employeeCode) { ({{ u.employeeCode }}) }
                    </mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <button mat-stroked-button type="button" (click)="loadAssignments()">Buscar</button>
            </div>

            <div class="table-wrap">
              <table mat-table [dataSource]="assignments()" style="width:100%">
                <ng-container matColumnDef="shiftId">
                  <th mat-header-cell *matHeaderCellDef>Turno</th>
                  <td mat-cell *matCellDef="let a">{{ shiftLabel(a.shiftId) }}</td>
                </ng-container>
                <ng-container matColumnDef="workSiteId">
                  <th mat-header-cell *matHeaderCellDef>Centro</th>
                  <td mat-cell *matCellDef="let a">{{ workSiteLabel(a.workSiteId) }}</td>
                </ng-container>
                <ng-container matColumnDef="range">
                  <th mat-header-cell *matHeaderCellDef>Vigencia</th>
                  <td mat-cell *matCellDef="let a">{{ a.validFrom }} → {{ a.validTo || '—' }}</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="assignmentColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: assignmentColumns"></tr>
              </table>
            </div>
            @if (assignments().length === 0) {
              <app-empty-state icon="assignment_ind" message="Buscá un usuario para ver sus asignaciones." />
            }
          </mat-card-content>
        </mat-card>
      </mat-tab>
    </mat-tab-group>
  `,
})
export class SchedulingComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SchedulingService);
  private readonly userService = inject(UserService);
  private readonly workSiteService = inject(WorkSiteService);
  private readonly notify = inject(NotificationService);
  protected readonly router = inject(Router);

  protected readonly scheduleColumns = ['code', 'name', 'status', 'actions'];
  protected readonly shiftColumns = ['name', 'time', 'tolerance', 'window', 'actions'];
  protected readonly assignmentColumns = ['shiftId', 'workSiteId', 'range'];

  protected readonly schedules = signal<Schedule[]>([]);
  protected readonly shifts = signal<Shift[]>([]);
  protected readonly assignments = signal<Assignment[]>([]);
  protected readonly users = signal<User[]>([]);
  protected readonly workSites = signal<WorkSite[]>([]);
  protected readonly assignShifts = signal<Shift[]>([]);
  protected readonly shiftsById = signal<Record<string, Shift>>({});
  protected readonly selectedSchedule = signal<Schedule | null>(null);
  protected readonly editingShiftId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly shiftForm = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    startTime: ['08:00', [Validators.required]],
    endTime: ['17:00', [Validators.required]],
    lateToleranceMin: [10],
    // Ventana de registro (RN-15). Se expone porque es lo que decide si quien llega pronto a su
    // turno puede marcar o se le rechaza: con los 30 min de default, llegar 31 antes ya es un
    // OUT_OF_SCHEDULE, y hasta ahora no había forma de ensancharla desde la aplicación.
    windowBeforeMin: [30],
    windowAfterMin: [30],
    crossesMidnight: [false],
  });

  protected readonly assignForm = this.fb.nonNullable.group({
    userId: ['', [Validators.required]],
    scheduleId: [''],
    shiftId: ['', [Validators.required]],
    workSiteId: [''],
    validFrom: ['', [Validators.required]],
    validTo: [''],
  });

  protected readonly lookupUserId = this.fb.nonNullable.control('');

  constructor() {
    this.assignForm.controls.shiftId.disable();
    this.reloadSchedules();
    this.reloadLookups();
  }

  private reloadLookups(): void {
    this.userService.list(0, 200).subscribe({
      next: (result) => this.users.set(result.content),
      error: () => this.error.set('No se pudo cargar la lista de usuarios.'),
    });
    this.workSiteService.list(0, 200).subscribe({
      next: (result) => this.workSites.set(result.content),
      error: () => this.error.set('No se pudo cargar la lista de centros de trabajo.'),
    });
  }

  /** Puebla el desplegable de turnos del formulario de asignación al elegir un horario. */
  protected onAssignScheduleChange(scheduleId: string): void {
    this.assignForm.controls.shiftId.reset('');
    if (!scheduleId) {
      this.assignShifts.set([]);
      this.assignForm.controls.shiftId.disable();
      return;
    }
    this.assignForm.controls.shiftId.enable();
    this.service.listShifts(scheduleId).subscribe({
      next: (shifts) => this.assignShifts.set(shifts),
      error: () => this.notify.error('No se pudieron cargar los turnos del horario.'),
    });
  }

  private reloadSchedules(): void {
    this.service.listSchedules(0, 100).subscribe({
      next: (result) => {
        this.schedules.set(result.content);
        this.reloadShiftIndex(result.content);
      },
      error: () => this.error.set('No se pudo cargar horarios (¿permiso schedule:manage?).'),
    });
  }

  /** Construye el índice de turnos por id (de todos los horarios) para resolver nombres en la tabla de asignaciones. */
  private reloadShiftIndex(schedules: Schedule[]): void {
    if (!schedules.length) {
      this.shiftsById.set({});
      return;
    }
    forkJoin(
      schedules.map((s) => this.service.listShifts(s.id).pipe(catchError(() => of([] as Shift[])))),
    ).subscribe({
      next: (lists) => {
        const index: Record<string, Shift> = {};
        for (const list of lists) {
          for (const shift of list) {
            index[shift.id] = shift;
          }
        }
        this.shiftsById.set(index);
      },
      error: () => {},
    });
  }

  protected shiftLabel(shiftId: string): string {
    const shift = this.shiftsById()[shiftId];
    return shift ? `${shift.name} (${shift.startTime.substring(0, 5)}–${shift.endTime.substring(0, 5)})` : shiftId;
  }

  protected workSiteLabel(workSiteId?: string): string {
    if (!workSiteId) {
      return '—';
    }
    return this.workSites().find((w) => w.id === workSiteId)?.name ?? workSiteId;
  }

  protected editSchedule(schedule: Schedule): void {
    void this.router.navigate(['/scheduling', schedule.id, 'edit']);
  }

  protected selectSchedule(schedule: Schedule): void {
    this.selectedSchedule.set(schedule);
    this.resetShiftForm();
    this.service.listShifts(schedule.id).subscribe({
      next: (shifts) => this.shifts.set(shifts),
      error: () => this.notify.error('No se pudieron cargar los turnos.'),
    });
  }

  protected saveShift(): void {
    const schedule = this.selectedSchedule();
    if (!schedule || this.shiftForm.invalid) {
      return;
    }
    const raw = this.shiftForm.getRawValue();
    const payload = {
      name: raw.name,
      startTime: raw.startTime,
      endTime: raw.endTime,
      lateToleranceMin: raw.lateToleranceMin ?? undefined,
      windowBeforeMin: raw.windowBeforeMin ?? undefined,
      windowAfterMin: raw.windowAfterMin ?? undefined,
      crossesMidnight: raw.crossesMidnight,
    };
    const editId = this.editingShiftId();
    const request$ = editId
      ? this.service.updateShift(editId, payload)
      : this.service.createShift(schedule.id, payload);
    request$.subscribe({
      next: () => {
        this.notify.success(editId ? 'Turno actualizado.' : 'Turno agregado.');
        this.resetShiftForm();
        this.selectSchedule(schedule);
      },
      error: () => this.notify.error('No se pudo guardar el turno.'),
    });
  }

  protected editShift(shift: Shift): void {
    this.editingShiftId.set(shift.id);
    this.shiftForm.reset({
      name: shift.name,
      startTime: shift.startTime.substring(0, 5),
      endTime: shift.endTime.substring(0, 5),
      lateToleranceMin: shift.lateToleranceMin,
      windowBeforeMin: shift.windowBeforeMin,
      windowAfterMin: shift.windowAfterMin,
      crossesMidnight: shift.crossesMidnight,
    });
  }

  protected resetShiftForm(): void {
    this.editingShiftId.set(null);
    this.shiftForm.reset({
      startTime: '08:00',
      endTime: '17:00',
      lateToleranceMin: 10,
      windowBeforeMin: 30,
      windowAfterMin: 30,
      crossesMidnight: false,
    });
  }

  protected assign(): void {
    if (this.assignForm.invalid) {
      return;
    }
    const raw = this.assignForm.getRawValue();
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
          this.notify.success('Asignación creada.');
          this.assignForm.reset();
          this.assignShifts.set([]);
          this.assignForm.controls.shiftId.disable();
        },
        error: () => this.notify.error('No se pudo crear la asignación.'),
      });
  }

  protected loadAssignments(): void {
    const userId = this.lookupUserId.value.trim();
    if (!userId) {
      return;
    }
    this.service.listAssignments(userId).subscribe({
      next: (list) => this.assignments.set(list),
      error: () => this.notify.error('No se pudieron cargar las asignaciones.'),
    });
  }
}
