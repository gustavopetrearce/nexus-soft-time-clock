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
import { CONTRACT_TYPES, Contract, ContractOptions, ContractType, fitsInProject, hrErrorMessage } from './contract.models';
import { ContractService } from './contract.service';

export interface ContractDialogData {
  /** Al editar: tipo, colaborador y proyecto no cambian (se cancela y se registra otro). */
  contract?: Contract;
  /** Valores iniciales al registrar desde otra pantalla (p. ej. el detalle del proyecto). */
  preset?: { userId?: string; type?: ContractType; projectId?: string };
}

/**
 * Registrar o editar el contrato de un colaborador (RF-30).
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
    TranslocoPipe, AppDatePipe, AlertComponent,
  ],
  template: `
    <div class="m-head">
      <div class="badge-ic"><mat-icon>badge</mat-icon></div>
      <div class="t">
        <h2>{{ (editing ? 'contracts.dialog.editTitle' : 'contracts.dialog.title') | transloco }}</h2>
        <p>{{ 'contracts.dialog.subtitle' | transloco }}</p>
      </div>
      <button mat-icon-button (click)="ref.close(false)" [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
    </div>

    <form [formGroup]="form" class="m-body">
      @if (problem()) { <app-alert tone="error">{{ problem() }}</app-alert> }

      <mat-form-field appearance="outline" class="full">
        <mat-label>{{ 'contracts.collaborator' | transloco }} *</mat-label>
        <mat-select formControlName="userId">
          @for (u of options().collaborators; track u.id) {
            <mat-option [value]="u.id">{{ u.fullName }}{{ u.employeeCode ? ' · ' + u.employeeCode : '' }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <div class="grid2">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'contracts.type' | transloco }} *</mat-label>
          <mat-select formControlName="type">
            @for (t of types; track t) { <mat-option [value]="t">{{ 'contracts.types.' + t | transloco }}</mat-option> }
          </mat-select>
        </mat-form-field>
        @if (isProject()) {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'contracts.project' | transloco }} *</mat-label>
            <mat-select formControlName="projectId">
              @for (p of selectableProjects(); track p.id) {
                <mat-option [value]="p.id">{{ p.code }} · {{ p.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        } @else {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'contracts.workSite' | transloco }}</mat-label>
            <mat-select formControlName="workSiteId">
              <mat-option value="">—</mat-option>
              @for (w of options().workSites; track w.id) { <mat-option [value]="w.id">{{ w.name }}</mat-option> }
            </mat-select>
          </mat-form-field>
        }
      </div>
      @if (isProject()) {
        @if (project(); as p) {
          <p class="nx-text-small nx-sec hint">
            {{ 'contracts.dialog.projectValidity' | transloco }}:
            {{ p.startsOn ? (p.startsOn | appDate: 'dd/MM/yyyy') : ('contracts.noLimit' | transloco) }} –
            {{ p.endsOn ? (p.endsOn | appDate: 'dd/MM/yyyy') : ('contracts.noLimit' | transloco) }}
          </p>
        }
        <mat-form-field appearance="outline" class="full">
          <mat-label>{{ 'contracts.workSite' | transloco }}</mat-label>
          <mat-select formControlName="workSiteId">
            <mat-option value="">—</mat-option>
            @for (w of options().workSites; track w.id) { <mat-option [value]="w.id">{{ w.name }}</mat-option> }
          </mat-select>
        </mat-form-field>
      }
      <div class="grid2">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'contracts.startsOn' | transloco }} *</mat-label>
          <input matInput type="date" formControlName="startsOn" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'contracts.endsOn' | transloco }}</mat-label>
          <input matInput type="date" formControlName="endsOn" />
          <mat-hint>{{ (isProject() ? 'contracts.dialog.endProjectHint' : 'contracts.dialog.endShiftHint') | transloco }}</mat-hint>
        </mat-form-field>
      </div>
      @if (rangeError(); as key) {
        <p class="nx-text-small err">{{ key | transloco }}</p>
      }
      <mat-form-field appearance="outline" class="full">
        <mat-label>{{ 'contracts.notes' | transloco }}</mat-label>
        <textarea matInput rows="2" maxlength="500" formControlName="notes" [placeholder]="'users.form.optional' | transloco"></textarea>
      </mat-form-field>
    </form>

    <div class="m-foot">
      <span class="fill"></span>
      <button mat-button (click)="ref.close(false)">{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button color="primary" [disabled]="!valid() || saving()" [attr.aria-busy]="saving()" (click)="submit()">
        <mat-icon>check</mat-icon> {{ (editing ? 'common.saveChanges' : 'contracts.dialog.submit') | transloco }}
      </button>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .m-head { display: flex; align-items: center; gap: 14px; padding: 20px 28px 16px; border-bottom: 1px solid var(--nx-color-border-default); }
      .m-head .badge-ic { width: 44px; height: 44px; border-radius: 12px; background: var(--nx-color-action-primary-subtle); color: var(--nx-color-action-primary); display: grid; place-items: center; border: 1px solid var(--nx-color-border-brand); flex: none; }
      .m-head .t { flex: 1; }
      .m-head h2 { margin: 0; font-size: 1.15rem; font-weight: var(--nx-font-weight-bold); }
      .m-head p { margin: 2px 0 0; color: var(--nx-color-text-secondary); font-size: var(--nx-text-small-size); }
      .m-body { padding: 8px 28px 12px; }
      .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 var(--nx-space-4); }
      mat-form-field { width: 100%; }
      .hint { margin: calc(var(--nx-space-2) * -1) 0 var(--nx-space-4); }
      .err { margin: 0 0 var(--nx-space-4); color: var(--nx-color-status-error-fg); }
      .m-foot { display: flex; align-items: center; gap: 10px; padding: 14px 28px 18px; border-top: 1px solid var(--nx-color-border-default); }
      .m-foot .fill { flex: 1; }
      @media (max-width: 599px) { .grid2 { grid-template-columns: 1fr; } .m-head, .m-body, .m-foot { padding-left: 16px; padding-right: 16px; } }
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

  protected readonly valid = computed(() => {
    const v = this.value();
    if (!v.userId || !v.startsOn || this.rangeError()) return false;
    return !this.isProject() || !!v.projectId;
  });

  constructor() {
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
    if (!this.valid()) return;
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
