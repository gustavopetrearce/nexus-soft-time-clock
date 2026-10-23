import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
import { PROJECT_STATUSES, Project } from './project.models';
import { ProjectService } from './project.service';

/** Alta / edición de proyecto en página completa (con breadcrumb). */
@Component({
  selector: 'app-project-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
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
        { label: ('layout.group.planning' | transloco), route: '/projects' },
        { label: ('projects.title' | transloco), route: '/projects' },
        { label: isEdit() ? (project()?.name ?? '') : ('projects.new' | transloco) },
      ]"
    />
    <app-page-header [title]="(isEdit() ? 'projects.edit' : 'projects.new') | transloco" />

    @if (loading()) { <mat-progress-bar mode="indeterminate" style="margin-bottom:16px" /> }
    @if (error()) { <p class="error-text">{{ error() }}</p> }

    <div class="form-page-layout">
      <div class="form-page-main">
        <form [formGroup]="form">
          <div class="form-section">
            <h3 class="form-section-title">{{ 'projects.form.info' | transloco }}</h3>
            <div class="form-grid-2">
              <mat-form-field appearance="outline" class="drawer-field">
                <mat-label>{{ 'common.code' | transloco }}</mat-label>
                <input matInput formControlName="code" />
                <mat-hint>{{ 'projects.form.codeHint' | transloco }}</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" class="drawer-field">
                <mat-label>{{ 'common.name' | transloco }}</mat-label>
                <input matInput formControlName="name" />
                <mat-hint>{{ 'projects.form.nameHint' | transloco }}</mat-hint>
              </mat-form-field>
              @if (isEdit()) {
                <mat-form-field appearance="outline" class="drawer-field">
                  <mat-label>{{ 'common.status' | transloco }}</mat-label>
                  <mat-select formControlName="status">
                    @for (s of statuses; track s) { <mat-option [value]="s">{{ 'projects.status.' + s | transloco }}</mat-option> }
                  </mat-select>
                  <mat-hint>{{ 'projects.form.statusHint' | transloco }}</mat-hint>
                </mat-form-field>
              }
            </div>
          </div>

          <div class="form-section">
            <h3 class="form-section-title">{{ 'projects.form.dates' | transloco }}</h3>
            <div class="form-grid-2">
              <mat-form-field appearance="outline" class="drawer-field">
                <mat-label>{{ 'projects.form.start' | transloco }}</mat-label>
                <input matInput type="date" formControlName="startsOn" />
                <mat-hint>{{ 'projects.form.startHint' | transloco }}</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" class="drawer-field">
                <mat-label>{{ 'projects.form.end' | transloco }}</mat-label>
                <input matInput type="date" formControlName="endsOn" />
                <mat-hint>{{ 'projects.form.endHint' | transloco }}</mat-hint>
              </mat-form-field>
            </div>
          </div>
        </form>

        <div class="form-actions">
          <button mat-button type="button" (click)="cancel()">{{ 'common.cancel' | transloco }}</button>
          <button mat-flat-button color="primary" [disabled]="!formValid() || saving()" (click)="save()">
            <mat-icon>save</mat-icon> {{ (isEdit() ? 'common.saveChanges' : 'projects.form.save') | transloco }}
          </button>
        </div>
      </div>

      <div class="form-page-side">
        <div class="info-card tip">
          <h3 class="info-card-title">{{ 'companies.form.importantInfo' | transloco }}</h3>
          <div class="icon-row">
            <mat-icon>shield</mat-icon>
            <div>
              <p class="row-title">{{ 'projects.form.whatIs' | transloco }}</p>
              <p class="row-desc">{{ 'projects.form.whatIsText' | transloco }}</p>
            </div>
          </div>
          <div class="icon-row">
            <mat-icon>badge</mat-icon>
            <div>
              <p class="row-title">{{ 'companies.form.uniqueCode' | transloco }}</p>
              <p class="row-desc">{{ 'projects.form.uniqueCodeText' | transloco }}</p>
            </div>
          </div>
        </div>

        @if (isEdit() && project(); as p) {
          <div class="info-card">
            <div class="entity-avatar-row">
              <div class="entity-avatar"><mat-icon>folder</mat-icon></div>
              <div>
                <p class="entity-avatar-name">{{ p.name }}</p>
                <app-status-chip [status]="p.status" />
              </div>
            </div>
            <div class="info-row"><span class="k">{{ 'common.code' | transloco }}</span><span class="v">{{ p.code }}</span></div>
          </div>
        }
      </div>
    </div>
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
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required]],
    name: ['', [Validators.required]],
    status: ['ACTIVE'],
    startsOn: [''],
    endsOn: [''],
  });

  private readonly formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  protected readonly formValid = computed(() => this.formStatus() === 'VALID');

  constructor() {
    if (this.projectId) {
      this.loading.set(true);
      this.service.get(this.projectId).subscribe({
        next: (p) => {
          this.project.set(p);
          this.form.reset({
            code: p.code,
            name: p.name,
            status: p.status,
            startsOn: p.startsOn ?? '',
            endsOn: p.endsOn ?? '',
          });
          this.form.controls.code.disable();
          this.loading.set(false);
        },
        error: () => {
          this.error.set(this.transloco.translate('projects.form.loadError'));
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
      return;
    }
    const raw = this.form.getRawValue();
    this.saving.set(true);
    const request$ = this.projectId
      ? this.service.update(this.projectId, {
          name: raw.name,
          status: raw.status as Project['status'],
          startsOn: raw.startsOn || undefined,
          endsOn: raw.endsOn || undefined,
        })
      : this.service.create({
          code: raw.code,
          name: raw.name,
          startsOn: raw.startsOn || undefined,
          endsOn: raw.endsOn || undefined,
        });
    request$.subscribe({
      next: () => {
        this.notify.success(this.transloco.translate(this.projectId ? 'projects.form.updated' : 'projects.form.created'));
        void this.router.navigate(['/projects']);
      },
      error: () => {
        this.saving.set(false);
        this.notify.error(this.transloco.translate('projects.form.saveError'));
      },
    });
  }
}
