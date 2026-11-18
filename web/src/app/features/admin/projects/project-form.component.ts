import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthStore } from '../../../core/auth/auth.store';
import { AppDatePipe } from '../../../core/i18n/app-date.pipe';
import { openDrawer } from '../../../core/ui/drawer';
import { ScrollDirective } from '../../../core/ui/scroll.directive';
import { StatusChipComponent } from '../../../core/ui/status-chip.component';
import { ContractDialogComponent } from '../../contracts/contract-dialog.component';
import { Contract } from '../../contracts/contract.models';
import { ContractService } from '../../contracts/contract.service';

import { AlertComponent } from '../../../core/ui/alert.component';
import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { localizedProblem } from '../../../core/ui/problem-detail';
import { PROJECT_STATUSES, Project } from './project.models';
import { ProjectService } from './project.service';

export interface ProjectDrawerData {
  /** Proyecto a editar; sin él, se crea uno nuevo. */
  projectId: string | null;
}

/**
 * P35 · Nuevo o editar proyecto (Drawer sobre P34, HIFI/03 F): Código · Estado, Nombre a ancho
 * completo, Inicio · Fin. Al crear, campos vacíos y Estado «Activo» (el alta siempre nace activa).
 * Un código repetido se avisa en el formulario. Al editar, con `contract:manage`, debajo van los
 * colaboradores asignados por contrato de proyecto (iteración 14, sin maqueta: Lista).
 */
@Component({
  selector: 'app-project-form',
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
    AlertComponent,
    EmptyStateComponent,
    LoadingBarComponent,
    AppDatePipe,
    ScrollDirective,
    StatusChipComponent,
  ],
  styles: [
    `
      h2, h3, p, ul { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      form { display: flex; flex-direction: column; gap: var(--nx-space-gap-related); }
      .nx-capa__pie .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
      .err { color: var(--nx-color-status-error-fg); }
      .asignados { display: flex; flex-direction: column; gap: var(--nx-space-gap-related); }
      .asignados__enc { display: flex; align-items: center; gap: var(--nx-space-gap-related); }
      .asignados__enc div { flex: 1; }
      .revisar { color: var(--nx-color-status-warning-fg); vertical-align: middle; font-size: var(--nx-icon-size-sm); width: var(--nx-icon-size-sm); height: var(--nx-icon-size-sm); }
    `,
  ],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3" mat-dialog-title>{{ (isEdit() ? 'projects.edit' : 'projects.new') | transloco }}</h2>
      <button mat-icon-button type="button" mat-dialog-close [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
    </div>

    <div class="nx-capa__cuerpo nx-scroll" nxScroll aria-live="polite">
    <app-loading-bar [active]="loading()" />
    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco" />
    } @else {
      <form id="proyecto" [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (problem()) { <app-alert tone="error">{{ problem() }}</app-alert> }

        <div class="nx-form__grid">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'common.code' | transloco }}</mat-label>
            <input matInput formControlName="code" required autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'common.status' | transloco }}</mat-label>
            <mat-select formControlName="status">
              @for (s of statuses; track s) { <mat-option [value]="s">{{ 'projects.status.' + s | transloco }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" class="nx-campo--ancho">
            <mat-label>{{ 'common.name' | transloco }}</mat-label>
            <input matInput formControlName="name" required autocomplete="off" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'projects.startsOn' | transloco }}</mat-label>
            <input matInput type="date" formControlName="startsOn" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'projects.endsOn' | transloco }}</mat-label>
            <input matInput type="date" formControlName="endsOn" />
          </mat-form-field>
        </div>
        @if (rangeInvalid()) {
          <p class="nx-text-caption err">{{ 'projects.rangeInvalid' | transloco }}</p>
        }
      </form>

      @if (isEdit() && canManageContracts) {
        <section class="asignados">
          <div class="asignados__enc">
            <div>
              <h3 class="nx-text-heading-4 nx-form__seccion">{{ 'projects.contracts' | transloco }}</h3>
              <p class="nx-text-small nx-sec">{{ 'projects.contractsHint' | transloco }}</p>
            </div>
            @if (project()?.status === 'ACTIVE') {
              <button mat-stroked-button type="button" (click)="assign()"><mat-icon>person_add</mat-icon>{{ 'projects.assign' | transloco }}</button>
            }
          </div>
          @if (contracts().length === 0) {
            <app-empty-state icon="badge" [message]="'projects.noContracts' | transloco" />
          } @else {
            <ul class="nx-lista">
              @for (c of contracts(); track c.id) {
                <li class="nx-lista__fila">
                  <div class="nx-lista__texto">
                    <span class="nx-trunc">
                      {{ c.userName || c.userId }}
                      @if (c.employeeCode) { <span class="nx-sec nx-text-small"> · {{ c.employeeCode }}</span> }
                    </span>
                    <span class="nx-lista__secundario nx-text-numeric">
                      {{ c.startsOn | appDate: 'dd/MM/yyyy' }} –
                      {{ c.endsOn ? (c.endsOn | appDate: 'dd/MM/yyyy') : ('contracts.indefinite' | transloco) }}
                      @if (c.needsReview) {
                        <mat-icon class="revisar" [attr.aria-label]="'contracts.needsReview' | transloco" [attr.title]="'contracts.needsReviewHint' | transloco">warning</mat-icon>
                      }
                    </span>
                  </div>
                  <div class="nx-lista__trail"><app-status-chip [status]="c.status" [label]="'contracts.status.' + c.status | transloco" /></div>
                </li>
              }
            </ul>
          }
        </section>
      }
    }
    </div>

    <div class="nx-capa__pie">
      <button mat-button type="button" mat-dialog-close><mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button type="submit" form="proyecto" [disabled]="saving()" [attr.aria-busy]="saving()">
        @if (saving()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>save</mat-icon> }
        {{ 'common.save' | transloco }}
      </button>
    </div>
  `,
})
export class ProjectFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly data = inject<ProjectDrawerData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ProjectFormComponent, boolean>>(MatDialogRef);
  private readonly service = inject(ProjectService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly dialog = inject(MatDialog);
  private readonly contractService = inject(ContractService);
  protected readonly canManageContracts = inject(AuthStore).hasPermission('contract:manage');
  protected readonly contracts = signal<Contract[]>([]);

  protected readonly statuses = PROJECT_STATUSES;
  protected readonly projectId = this.data.projectId;
  protected readonly isEdit = computed(() => !!this.projectId);

  protected readonly project = signal<Project | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required]],
    name: ['', [Validators.required]],
    status: [{ value: 'ACTIVE', disabled: !this.data.projectId }],
    startsOn: [''],
    endsOn: [''],
  });

  private readonly rangeTick = signal(0);
  /** Fin anterior al inicio (también lo rechaza el servidor, V33). */
  protected readonly rangeInvalid = computed(() => {
    this.rangeTick();
    const { startsOn, endsOn } = this.form.getRawValue();
    return !!startsOn && !!endsOn && endsOn < startsOn;
  });

  constructor() {
    this.form.valueChanges.subscribe(() => this.rangeTick.update((n) => n + 1));
    if (this.projectId && this.canManageContracts) {
      this.loadContracts();
    }
    if (this.projectId) {
      this.loading.set(true);
      this.service.get(this.projectId).subscribe({
        next: (p) => {
          this.project.set(p);
          this.form.reset({ code: p.code, name: p.name, status: p.status, startsOn: p.startsOn ?? '', endsOn: p.endsOn ?? '' });
          this.form.controls.code.disable();
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
    }
  }

  private loadContracts(): void {
    if (!this.projectId) return;
    this.contractService.list(0, 200, { projectId: this.projectId, type: 'PROJECT' }).subscribe({
      next: (r) => this.contracts.set(r.content.filter((c) => c.status !== 'CANCELLED')),
      error: () => this.contracts.set([]),
    });
  }

  protected assign(): void {
    if (!this.projectId) return;
    openDrawer(this.dialog, ContractDialogComponent, {
      data: { preset: { type: 'PROJECT', projectId: this.projectId } },
      ariaLabel: this.transloco.translate('projects.assign'),
    })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.loadContracts();
      });
  }

  protected save(): void {
    if (this.form.invalid || this.rangeInvalid()) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.problem.set(null);
    const request$ = this.projectId
      ? this.service.update(this.projectId, {
          name: raw.name,
          status: raw.status as Project['status'],
          startsOn: raw.startsOn || undefined,
          endsOn: raw.endsOn || undefined,
        })
      : this.service.create({ code: raw.code, name: raw.name, startsOn: raw.startsOn || undefined, endsOn: raw.endsOn || undefined });
    request$.subscribe({
      next: () => {
        this.notify.success(this.transloco.translate(this.projectId ? 'projects.form.updated' : 'projects.form.created'));
        this.ref.close(true);
      },
      error: (err) => {
        this.saving.set(false);
        this.problem.set(localizedProblem(this.transloco, err, 'projects.form.saveError'));
      },
    });
  }
}
