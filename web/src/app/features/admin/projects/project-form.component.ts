import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AlertComponent } from '../../../core/ui/alert.component';
import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { localizedProblem } from '../../../core/ui/problem-detail';
import { PROJECT_STATUSES, Project } from './project.models';
import { ProjectService } from './project.service';

/**
 * P35 · Nuevo o editar proyecto (página, patrón Formulario): código único y obligatorio, nombre,
 * estado (al editar) y vigencia. Un código repetido se avisa en el formulario.
 */
@Component({
  selector: 'app-project-form',
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
  ],
  styles: [
    `
      h1 { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      .nx-form__acciones .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
    `,
  ],
  template: `
    <div class="nx-regresar">
      <a mat-button routerLink="/projects"><mat-icon>arrow_back</mat-icon>{{ 'common.back' | transloco }}</a>
    </div>
    <app-loading-bar [active]="loading()" />

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco" />
    } @else {
      <form class="nx-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <h1 class="nx-text-heading-1">{{ (isEdit() ? 'projects.edit' : 'projects.new') | transloco }}</h1>
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
          @if (isEdit()) {
            <mat-form-field appearance="outline">
              <mat-label>{{ 'common.status' | transloco }}</mat-label>
              <mat-select formControlName="status">
                @for (s of statuses; track s) { <mat-option [value]="s">{{ 'projects.status.' + s | transloco }}</mat-option> }
              </mat-select>
            </mat-form-field>
          }
          <mat-form-field appearance="outline">
            <mat-label>{{ 'projects.startsOn' | transloco }}</mat-label>
            <input matInput type="date" formControlName="startsOn" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'projects.endsOn' | transloco }}</mat-label>
            <input matInput type="date" formControlName="endsOn" />
          </mat-form-field>
        </div>

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
export class ProjectFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(ProjectService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);

  protected readonly statuses = PROJECT_STATUSES;
  protected readonly projectId = this.route.snapshot.paramMap.get('id');
  protected readonly isEdit = computed(() => !!this.projectId);

  protected readonly project = signal<Project | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required]],
    name: ['', [Validators.required]],
    status: ['ACTIVE'],
    startsOn: [''],
    endsOn: [''],
  });

  constructor() {
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

  protected cancel(): void {
    void this.router.navigate(['/projects']);
  }

  protected save(): void {
    if (this.form.invalid) {
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
        void this.router.navigate(['/projects']);
      },
      error: (err) => {
        this.saving.set(false);
        this.problem.set(localizedProblem(this.transloco, err, 'projects.form.saveError'));
      },
    });
  }
}
