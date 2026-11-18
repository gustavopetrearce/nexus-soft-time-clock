import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { AlertComponent } from '../../core/ui/alert.component';
import { NotificationService } from '../../core/ui/notification.service';
import { ScrollDirective } from '../../core/ui/scroll.directive';
import { CONTRACT_TYPES, Contract, ContractOptions, ContractType, fitsInProject, hrErrorMessage } from './contract.models';
import { ContractService } from './contract.service';

export interface ContractDialogData {
  /** Al editar: tipo, colaborador y proyecto no cambian (se cancela y se registra otro). */
  contract?: Contract;
  /** Valores iniciales al registrar desde otra pantalla (p. ej. el detalle del proyecto). */
  preset?: { userId?: string; type?: ContractType; projectId?: string };
}

/**
 * Registrar o editar el contrato de un colaborador (RF-30), en Drawer como las altas del catálogo
 * (HIFI/08, reglas comunes; sin maqueta propia).
 * <ul>
 *   <li>Por proyecto: el periodo cabe en la vigencia del proyecto (RN-64); sin fin, hereda el del proyecto.</li>
 *   <li>Por turno: periodo de empleo; sin fin = indefinido.</li>
 * </ul>
 * El traslape con otro contrato (RN-63) lo valida el servidor y se muestra su mensaje.
 */
@Component({
  selector: 'app-contract-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    TranslocoPipe, AppDatePipe, AlertComponent, ScrollDirective,
  ],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3" mat-dialog-title>{{ (editing ? 'contracts.dialog.editTitle' : 'contracts.dialog.title') | transloco }}</h2>
      <button mat-icon-button type="button" (click)="ref.close(false)" [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
    </div>

    <form [formGroup]="form" class="nx-capa__cuerpo nx-scroll" nxScroll id="contrato" (ngSubmit)="submit()" novalidate aria-live="polite">
      <p class="nx-text-small nx-sec">{{ 'contracts.dialog.subtitle' | transloco }}</p>
      @if (problem()) { <app-alert tone="error">{{ problem() }}</app-alert> }

      <div class="nx-form__grid">
        <mat-form-field appearance="outline" class="nx-campo--ancho">
          <mat-label>{{ 'contracts.collaborator' | transloco }}</mat-label>
          <mat-select formControlName="userId" required>
            @for (u of options().collaborators; track u.id) {
              <mat-option [value]="u.id">{{ u.fullName }}{{ u.employeeCode ? ' · ' + u.employeeCode : '' }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'contracts.type' | transloco }}</mat-label>
          <mat-select formControlName="type" required>
            @for (t of types; track t) { <mat-option [value]="t">{{ 'contracts.types.' + t | transloco }}</mat-option> }
          </mat-select>
        </mat-form-field>
        @if (isProject()) {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'contracts.project' | transloco }}</mat-label>
            <mat-select formControlName="projectId" required>
              @for (p of selectableProjects(); track p.id) {
                <mat-option [value]="p.id">{{ p.code }} · {{ p.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          @if (project(); as p) {
            <p class="nx-text-small nx-sec nx-campo--ancho">
              {{ 'contracts.dialog.projectValidity' | transloco }}:
              <span class="nx-text-numeric">{{ p.startsOn ? (p.startsOn | appDate: 'dd/MM/yyyy') : ('contracts.noLimit' | transloco) }} –
              {{ p.endsOn ? (p.endsOn | appDate: 'dd/MM/yyyy') : ('contracts.noLimit' | transloco) }}</span>
            </p>
          }
        }
        <mat-form-field appearance="outline" [class.nx-campo--ancho]="isProject()">
          <mat-label>{{ 'contracts.workSite' | transloco }}</mat-label>
          <mat-select formControlName="workSiteId">
            <mat-option value="">—</mat-option>
            @for (w of options().workSites; track w.id) { <mat-option [value]="w.id">{{ w.name }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'contracts.startsOn' | transloco }}</mat-label>
          <input matInput type="date" formControlName="startsOn" required />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'contracts.endsOn' | transloco }}</mat-label>
          <input matInput type="date" formControlName="endsOn" />
          <mat-hint>{{ (isProject() ? 'contracts.dialog.endProjectHint' : 'contracts.dialog.endShiftHint') | transloco }}</mat-hint>
        </mat-form-field>
        @if (rangeError(); as key) {
          <p class="nx-text-caption err nx-campo--ancho" role="alert">{{ key | transloco }}</p>
        }
        <mat-form-field appearance="outline" class="nx-campo--ancho">
          <mat-label>{{ 'contracts.notes' | transloco }}</mat-label>
          <textarea matInput rows="2" maxlength="500" formControlName="notes"></textarea>
          <mat-hint>{{ 'users.form.optional' | transloco }}</mat-hint>
        </mat-form-field>
      </div>
    </form>

    <div class="nx-capa__pie">
      <button mat-button type="button" (click)="ref.close(false)"><mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button type="submit" form="contrato" [disabled]="saving()" [attr.aria-busy]="saving()">
        @if (saving()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>save</mat-icon> }
        {{ (editing ? 'common.saveChanges' : 'contracts.dialog.submit') | transloco }}
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
export class ContractDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ContractService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  protected readonly ref = inject(MatDialogRef<ContractDialogComponent, boolean>);
  private readonly data = inject<ContractDialogData | null>(MAT_DIALOG_DATA, { optional: true });

  protected readonly types = CONTRACT_TYPES;
  protected readonly editing = this.data?.contract;
  protected readonly options = signal<ContractOptions>({ collaborators: [], projects: [], workSites: [] });
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    userId: [this.editing?.userId ?? this.data?.preset?.userId ?? '', [Validators.required]],
    type: [(this.editing?.type ?? this.data?.preset?.type ?? 'SHIFT') as ContractType, [Validators.required]],
    projectId: [this.editing?.projectId ?? this.data?.preset?.projectId ?? ''],
    workSiteId: [this.editing?.workSiteId ?? ''],
    startsOn: [this.editing?.startsOn ?? '', [Validators.required]],
    endsOn: [this.editing?.endsOn ?? ''],
    notes: [this.editing?.notes ?? ''],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly isProject = computed(() => this.value().type === 'PROJECT');
  protected readonly project = computed(() => this.options().projects.find((p) => p.id === this.value().projectId));

  /** Al registrar solo se ofrecen proyectos activos; al editar se conserva el del contrato. */
  protected readonly selectableProjects = computed(() =>
    this.options().projects.filter((p) => p.status === 'ACTIVE' || p.id === this.editing?.projectId),
  );

  /** Clave i18n del problema de fechas, o null. Un fin vacío en un proyecto con fin se hereda al registrar. */
  protected readonly rangeError = computed<string | null>(() => {
    const v = this.value();
    if (!v.startsOn) return null;
    if (v.endsOn && v.endsOn < v.startsOn) return 'contracts.dialog.rangeInvalid';
    const p = this.project();
    if (this.isProject() && p) {
      const end = v.endsOn || (this.editing ? undefined : p.endsOn);
      if (!fitsInProject(v.startsOn, end, p)) return 'contracts.dialog.outOfProject';
    }
    return null;
  });

  constructor() {
    // El proyecto solo es obligatorio en los contratos por proyecto.
    this.form.controls.type.valueChanges.subscribe((type) => {
      this.form.controls.projectId.setValidators(type === 'PROJECT' ? [Validators.required] : []);
      this.form.controls.projectId.updateValueAndValidity({ emitEvent: false });
    });
    if (this.form.controls.type.value === 'PROJECT') this.form.controls.projectId.setValidators([Validators.required]);
    if (this.editing) {
      this.form.controls.userId.disable();
      this.form.controls.type.disable();
      this.form.controls.projectId.disable();
    }
    this.service.options().subscribe({
      next: (o) => this.options.set(o),
      error: () => this.problem.set(this.transloco.translate('common.loadError')),
    });
  }

  protected submit(): void {
    // El botón nunca se deshabilita antes del primer intento: los errores aparecen al enviar (C1, C2).
    if (this.form.invalid || this.rangeError()) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const project = raw.type === 'PROJECT';
    this.saving.set(true);
    this.problem.set(null);
    const request$ = this.editing
      ? this.service.update(this.editing.id, {
          workSiteId: raw.workSiteId || undefined,
          startsOn: raw.startsOn,
          endsOn: raw.endsOn || undefined,
          notes: raw.notes.trim() || undefined,
        })
      : this.service.create({
          userId: raw.userId,
          type: raw.type,
          projectId: project ? raw.projectId : undefined,
          workSiteId: raw.workSiteId || undefined,
          startsOn: raw.startsOn,
          endsOn: raw.endsOn || undefined,
          notes: raw.notes.trim() || undefined,
        });
    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.notify.success(this.transloco.translate(this.editing ? 'contracts.dialog.updated' : 'contracts.dialog.created'));
        this.ref.close(true);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.problem.set(hrErrorMessage(err) ?? this.transloco.translate('contracts.dialog.saveError'));
      },
    });
  }
}
