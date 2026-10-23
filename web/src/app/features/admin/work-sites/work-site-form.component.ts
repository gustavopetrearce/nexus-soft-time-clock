import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { BreadcrumbComponent } from '../../../core/ui/breadcrumb.component';
import { ConfirmDialogComponent } from '../../../core/ui/confirm-dialog.component';
import { MapInlineComponent } from '../../../core/ui/map-inline.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { StatusChipComponent } from '../../../core/ui/status-chip.component';
import { timezoneOptions } from '../../../core/models/timezones';
import { PolicyOverride, WorkSite } from './work-site.models';
import { WorkSiteService } from './work-site.service';

/** Alta / edición de centro de trabajo en página completa (con breadcrumb). */
@Component({
  selector: 'app-work-site-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    BreadcrumbComponent,
    MapInlineComponent,
    PageHeaderComponent,
    StatusChipComponent,
    TranslocoPipe,
  ],
  template: `
    <app-breadcrumb
      [items]="[
        { label: ('layout.group.organization' | transloco), route: '/work-sites' },
        { label: ('workSites.title' | transloco), route: '/work-sites' },
        { label: isEdit() ? (site()?.name ?? '') : ('workSites.new' | transloco) },
      ]"
    />
    <app-page-header [title]="(isEdit() ? 'workSites.edit' : 'workSites.new') | transloco" />

    @if (loading()) { <mat-progress-bar mode="indeterminate" style="margin-bottom:16px" /> }
    @if (error()) { <p class="error-text">{{ error() }}</p> }

    <div class="form-page-layout">
      <div class="form-page-main">
        <h3 class="form-section-title">{{ 'workSites.form.info' | transloco }}</h3>
        <form [formGroup]="form">
          <div style="display:flex; gap: var(--sp-5); align-items:flex-start; flex-wrap:wrap">
            <div style="flex: 1 1 320px; min-width:280px">
              <div class="form-grid-2">
                <mat-form-field appearance="outline" class="drawer-field">
                  <mat-label>{{ 'common.code' | transloco }}</mat-label>
                  <input matInput formControlName="code" />
                  <mat-hint>{{ 'workSites.form.codeHint' | transloco }}</mat-hint>
                </mat-form-field>
                <mat-form-field appearance="outline" class="drawer-field">
                  <mat-label>{{ 'workSites.form.name' | transloco }}</mat-label>
                  <input matInput formControlName="name" />
                  <mat-hint>{{ 'workSites.form.nameHint' | transloco }}</mat-hint>
                </mat-form-field>
              </div>
              <mat-form-field appearance="outline" class="drawer-field">
                <mat-label>{{ 'profile.address' | transloco }}</mat-label>
                <input matInput formControlName="address" />
                <mat-hint>{{ 'workSites.form.addressHint' | transloco }}</mat-hint>
              </mat-form-field>
              <div class="form-grid-2">
                <mat-form-field appearance="outline" class="drawer-field">
                  <mat-label>{{ 'workSites.latitude' | transloco }}</mat-label>
                  <input matInput type="number" step="any" formControlName="latitude" readonly />
                  <mat-hint>{{ 'workSites.form.coordHint' | transloco }}</mat-hint>
                </mat-form-field>
                <mat-form-field appearance="outline" class="drawer-field">
                  <mat-label>{{ 'workSites.longitude' | transloco }}</mat-label>
                  <input matInput type="number" step="any" formControlName="longitude" readonly />
                  <mat-hint>{{ 'workSites.form.coordHint' | transloco }}</mat-hint>
                </mat-form-field>
              </div>
            </div>
            <div style="flex: 0 0 300px; min-width:260px">
              <p class="row-title" style="margin:0 0 var(--sp-2)">{{ 'workSites.form.mapLocation' | transloco }}</p>
              <app-map-inline
                #map
                style="display:block; height:220px"
                [latitude]="form.controls.latitude.value"
                [longitude]="form.controls.longitude.value"
                [radiusMeters]="form.controls.gpsAccuracyMaxM.value ?? 50"
                (positionChange)="setPosition($event)"
              />
              <p class="row-desc" style="margin: var(--sp-2) 0">{{ 'workSites.form.accuracyRadius' | transloco: { m: form.controls.gpsAccuracyMaxM.value ?? 50 } }}</p>
              <button mat-stroked-button type="button" (click)="map.centerOnPoint()">
                <mat-icon>my_location</mat-icon> {{ 'workSites.form.centerMap' | transloco }}
              </button>
            </div>
          </div>
          <div class="form-grid-2">
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>{{ 'companies.form.timezone' | transloco }}</mat-label>
              <mat-select formControlName="timezone">
                <mat-option [value]="''">{{ 'workSites.form.inheritCompany' | transloco }}</mat-option>
                @for (tz of tzOptions(); track tz.value) {
                  <mat-option [value]="tz.value">{{ tz.label }}</mat-option>
                }
              </mat-select>
              <mat-hint>{{ 'workSites.form.timezoneHint' | transloco }}</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>{{ 'workSites.form.maxAccuracy' | transloco }}</mat-label>
              <input matInput type="number" formControlName="gpsAccuracyMaxM" />
              <mat-hint>{{ 'workSites.form.maxAccuracyHint' | transloco }}</mat-hint>
            </mat-form-field>
          </div>
          <div class="policy-row">
            <div>
              <p class="row-title">{{ 'workSites.form.photo' | transloco }}</p>
              <p class="row-desc">{{ 'workSites.form.photoText' | transloco }}</p>
            </div>
            <mat-button-toggle-group formControlName="requirePhoto" [attr.aria-label]="'workSites.form.photoPolicy' | transloco">
              <mat-button-toggle [value]="null">{{ 'workSites.form.inherit' | transloco }}</mat-button-toggle>
              <mat-button-toggle [value]="true">{{ 'common.yes' | transloco }}</mat-button-toggle>
              <mat-button-toggle [value]="false">{{ 'common.no' | transloco }}</mat-button-toggle>
            </mat-button-toggle-group>
          </div>
          <div class="policy-row">
            <div>
              <p class="row-title">{{ 'workSites.form.biometric' | transloco }}</p>
              <p class="row-desc">{{ 'workSites.form.biometricText' | transloco }}</p>
            </div>
            <mat-button-toggle-group formControlName="requireBiometric" [attr.aria-label]="'workSites.form.biometricPolicy' | transloco">
              <mat-button-toggle [value]="null">{{ 'workSites.form.inherit' | transloco }}</mat-button-toggle>
              <mat-button-toggle [value]="true">{{ 'common.yes' | transloco }}</mat-button-toggle>
              <mat-button-toggle [value]="false">{{ 'common.no' | transloco }}</mat-button-toggle>
            </mat-button-toggle-group>
          </div>
          <p class="row-desc policy-hint">
            <mat-icon>info</mat-icon>
            <span>{{ 'workSites.form.inheritHint' | transloco }}</span>
          </p>
        </form>

        <div class="form-callout">
          <mat-icon>info</mat-icon>
          <div>
            <p class="row-title">{{ 'companies.form.important' | transloco }}</p>
            <p class="row-desc">{{ 'workSites.form.importantText' | transloco }}</p>
          </div>
        </div>

        <div class="form-actions">
          <button mat-button type="button" (click)="cancel()">{{ 'common.cancel' | transloco }}</button>
          <button mat-flat-button color="primary" [disabled]="!formValid() || saving()" (click)="save()">
            <mat-icon>save</mat-icon> {{ (isEdit() ? 'common.saveChanges' : 'workSites.form.save') | transloco }}
          </button>
        </div>
      </div>

      <div class="form-page-side">
        <div class="info-card tip">
          <h3 class="info-card-title">{{ 'companies.form.importantInfo' | transloco }}</h3>
          <div class="icon-row">
            <mat-icon>my_location</mat-icon>
            <div>
              <p class="row-title">{{ 'workSites.form.gpsAccuracy' | transloco }}</p>
              <p class="row-desc">{{ 'workSites.form.gpsAccuracyText' | transloco }}</p>
            </div>
          </div>
          <div class="icon-row">
            <mat-icon>fingerprint</mat-icon>
            <div>
              <p class="row-title">{{ 'workSites.form.biometrics' | transloco }}</p>
              <p class="row-desc">{{ 'workSites.form.biometricsText' | transloco }}</p>
            </div>
          </div>
        </div>

        @if (isEdit() && site(); as s) {
          <div class="info-card">
            <div class="entity-avatar-row">
              <div class="entity-avatar"><mat-icon>place</mat-icon></div>
              <div>
                <p class="entity-avatar-name">{{ s.name }}</p>
                <app-status-chip [status]="s.status" />
              </div>
            </div>
            <div class="info-row"><span class="k">{{ 'common.code' | transloco }}</span><span class="v">{{ s.code }}</span></div>
          </div>
          <div class="info-card">
            <h3 class="info-card-title">{{ 'workSites.form.statusTitle' | transloco }}</h3>
            <p class="muted" style="margin:0 0 var(--sp-3)">
              {{ (s.status === 'ACTIVE' ? 'workSites.form.statusActiveText' : 'workSites.form.statusInactiveText') | transloco }}
            </p>
            <button mat-stroked-button (click)="toggleStatus(s)">
              {{ (s.status === 'ACTIVE' ? 'workSites.deactivate' : 'workSites.activate') | transloco }}
            </button>
          </div>
          <div class="info-card">
            <h3 class="info-card-title">{{ 'workSites.geofenceQr' | transloco }}</h3>
            <p class="muted" style="margin:0 0 var(--sp-3)">{{ 'workSites.form.geofenceText' | transloco }}</p>
            <a mat-stroked-button [routerLink]="['/work-sites', s.id, 'geofence']">
              <mat-icon>my_location</mat-icon> {{ 'workSites.form.goToGeofence' | transloco }}
            </a>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .policy-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sp-4);
        flex-wrap: wrap;
        padding: var(--sp-3) 0;
      }
      .policy-hint {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 var(--sp-3);
        color: var(--text-muted);
      }
      .policy-hint mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    `,
  ],
})
export class WorkSiteFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(WorkSiteService);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly siteId = this.route.snapshot.paramMap.get('id');
  protected readonly isEdit = computed(() => !!this.siteId);

  protected readonly site = signal<WorkSite | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** La lista es curada; si el centro guarda una zona fuera de ella se añade para no perderla. */
  protected readonly tzOptions = computed(() => timezoneOptions(this.site()?.timezone));

  protected readonly form = this.fb.group({
    code: this.fb.nonNullable.control('', [Validators.required]),
    name: this.fb.nonNullable.control('', [Validators.required]),
    address: this.fb.nonNullable.control(''),
    latitude: this.fb.control<number | null>(null, [Validators.required]),
    longitude: this.fb.control<number | null>(null, [Validators.required]),
    timezone: this.fb.nonNullable.control(''),
    gpsAccuracyMaxM: this.fb.control<number | null>(null),
    // Tri-estado: null = heredar de company_settings. Deliberadamente NO son `nonNullable`:
    // guardar `false` donde el usuario quiso "heredar" anularía la política de la empresa.
    requirePhoto: this.fb.control<PolicyOverride>(null),
    requireBiometric: this.fb.control<PolicyOverride>(null),
  });

  private readonly formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  protected readonly formValid = computed(() => this.formStatus() === 'VALID');

  constructor() {
    if (this.siteId) {
      this.loading.set(true);
      this.service.get(this.siteId).subscribe({
        next: (s) => {
          this.site.set(s);
          this.form.reset({
            code: s.code,
            name: s.name,
            address: s.address ?? '',
            latitude: s.latitude,
            longitude: s.longitude,
            timezone: s.timezone ?? '',
            gpsAccuracyMaxM: s.gpsAccuracyMaxM ?? null,
            requirePhoto: s.requirePhoto ?? null,
            requireBiometric: s.requireBiometric ?? null,
          });
          this.form.controls.code.disable();
          this.loading.set(false);
        },
        error: () => {
          this.error.set(this.transloco.translate('workSites.form.loadError'));
          this.loading.set(false);
        },
      });
    }
  }

  protected setPosition(position: { latitude: number; longitude: number }): void {
    this.form.patchValue({ latitude: position.latitude, longitude: position.longitude });
    this.form.markAsDirty();
  }

  protected cancel(): void {
    void this.router.navigate(['/work-sites']);
  }

  protected toggleStatus(site: WorkSite): void {
    const next = site.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: this.transloco.translate(next === 'INACTIVE' ? 'workSites.deactivate' : 'workSites.activate'),
          message: this.transloco.translate('companies.confirmStatus', {
            name: site.name,
            status: this.transloco.translate(`status.${next}`),
          }),
          color: next === 'INACTIVE' ? 'warn' : 'primary',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }
        this.service.setStatus(site.id, next).subscribe({
          next: (updated) => {
            this.site.set(updated);
            this.notify.success(this.transloco.translate('common.statusUpdated'));
          },
          error: () => this.notify.error(this.transloco.translate('common.statusError')),
        });
      });
  }

  protected save(): void {
    if (this.form.invalid) {
      return;
    }
    const raw = this.form.getRawValue();
    const common = {
      name: raw.name,
      address: raw.address || undefined,
      latitude: raw.latitude as number,
      longitude: raw.longitude as number,
      timezone: raw.timezone || undefined,
      gpsAccuracyMaxM: raw.gpsAccuracyMaxM ?? undefined,
      requirePhoto: raw.requirePhoto,
      requireBiometric: raw.requireBiometric,
    };
    this.saving.set(true);
    const request$ = this.siteId
      ? this.service.update(this.siteId, common)
      : this.service.create({ code: raw.code, ...common });
    request$.subscribe({
      next: () => {
        this.notify.success(this.transloco.translate(this.siteId ? 'workSites.form.updated' : 'workSites.form.created'));
        void this.router.navigate(['/work-sites']);
      },
      error: () => {
        this.saving.set(false);
        this.notify.error(this.transloco.translate('workSites.form.saveError'));
      },
    });
  }
}
