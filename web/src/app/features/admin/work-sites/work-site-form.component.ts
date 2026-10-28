import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { MapInlineComponent } from '../../../core/ui/map-inline.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { localizedProblem } from '../../../core/ui/problem-detail';
import { StatusChipComponent } from '../../../core/ui/status-chip.component';
import { timezoneOptions } from '../../../core/models/timezones';
import { PolicyOverride, WorkSite } from './work-site.models';
import { WorkSiteService } from './work-site.service';

/**
 * P26 · Nuevo o editar centro (página con paneles laterales): código y nombre obligatorios, la
 * ubicación se marca en el mapa (obligatoria), precisión máxima y políticas tri-estado de foto y
 * biometría (Heredar = NULL). Desactivar o activar desde el panel no pide confirmación (reversible).
 */
@Component({
  selector: 'app-work-site-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    AlertComponent,
    EmptyStateComponent,
    LoadingBarComponent,
    MapInlineComponent,
    StatusChipComponent,
    TranslocoPipe,
  ],
  styles: [
    `
      h1, h2, p, dl, dd { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      app-map-inline { display: block; width: 100%; height: calc(var(--nx-space-16) * 4); }
      .nx-panel mat-icon { color: var(--nx-color-action-primary); }
      .consejo { display: flex; gap: var(--nx-space-gap-related); }
      .consejo p + p { color: var(--nx-color-text-secondary); }
      .titulo { display: flex; align-items: center; gap: var(--nx-space-gap-inline); flex-wrap: wrap; }
      .nx-form__acciones .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
      a[mat-stroked-button], button[mat-stroked-button] { align-self: flex-start; }
    `,
  ],
  template: `
    <div class="nx-regresar">
      <a mat-button routerLink="/work-sites"><mat-icon>arrow_back</mat-icon>{{ 'common.back' | transloco }}</a>
    </div>
    <app-loading-bar [active]="loading()" />

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco" />
    } @else {
      <div class="nx-g-8-4 nx-form-lado">
        <form class="nx-form" [formGroup]="form" (ngSubmit)="save()" novalidate aria-live="polite">
          <h1 class="nx-text-heading-1">{{ (isEdit() ? 'workSites.edit' : 'workSites.new') | transloco }}</h1>
          @if (problem()) { <app-alert tone="error">{{ problem() }}</app-alert> }
          @if (missingLocation()) { <app-alert tone="error">{{ 'workSites.form.markLocation' | transloco }}</app-alert> }

          <div class="nx-form__grid">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'common.code' | transloco }}</mat-label>
              <input matInput formControlName="code" required autocomplete="off" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'common.name' | transloco }}</mat-label>
              <input matInput formControlName="name" required autocomplete="off" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'profile.address' | transloco }}</mat-label>
              <input matInput formControlName="address" autocomplete="off" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'companies.form.timezone' | transloco }}</mat-label>
              <mat-select formControlName="timezone">
                <mat-option [value]="''">{{ 'workSites.form.inheritCompany' | transloco }}</mat-option>
                @for (tz of tzOptions(); track tz.value) { <mat-option [value]="tz.value">{{ tz.label }}</mat-option> }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'workSites.form.latLng' | transloco }}</mat-label>
              <input matInput [value]="latLng()" readonly class="nx-text-numeric" />
              <mat-hint>{{ 'workSites.form.coordHint' | transloco }}</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'workSites.form.maxAccuracy' | transloco }}</mat-label>
              <input matInput type="number" formControlName="gpsAccuracyMaxM" />
            </mat-form-field>
            <div class="nx-form__fila3">
              <mat-form-field appearance="outline">
                <mat-label>{{ 'workSites.form.photo' | transloco }}</mat-label>
                <mat-select [value]="policyValue(form.controls.requirePhoto.value)" (selectionChange)="setPolicy('requirePhoto', $event.value)">
                  <mat-option value="inherit">{{ 'workSites.form.inherit' | transloco }}</mat-option>
                  <mat-option value="yes">{{ 'common.yes' | transloco }}</mat-option>
                  <mat-option value="no">{{ 'common.no' | transloco }}</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'workSites.form.biometrics' | transloco }}</mat-label>
                <mat-select [value]="policyValue(form.controls.requireBiometric.value)" (selectionChange)="setPolicy('requireBiometric', $event.value)">
                  <mat-option value="inherit">{{ 'workSites.form.inherit' | transloco }}</mat-option>
                  <mat-option value="yes">{{ 'common.yes' | transloco }}</mat-option>
                  <mat-option value="no">{{ 'common.no' | transloco }}</mat-option>
                </mat-select>
              </mat-form-field>
            </div>
          </div>

          <div class="nx-mapa nx-mapa--form">
            <app-map-inline
              #map
              [latitude]="form.controls.latitude.value"
              [longitude]="form.controls.longitude.value"
              [radiusMeters]="form.controls.gpsAccuracyMaxM.value ?? 50"
              (positionChange)="setPosition($event)"
            />
          </div>
          <button mat-stroked-button type="button" (click)="map.centerOnPoint()"><mat-icon>my_location</mat-icon>{{ 'workSites.form.centerMap' | transloco }}</button>

          <div class="nx-form__acciones">
            <button mat-button type="button" (click)="cancel()"><mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}</button>
            <button mat-flat-button type="submit" [disabled]="saving()" [attr.aria-busy]="saving()">
              @if (saving()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>save</mat-icon> }
              {{ 'common.save' | transloco }}
            </button>
          </div>
        </form>

        <div class="nx-pila">
          <section class="nx-panel">
            <h2 class="nx-text-heading-4">{{ 'companies.form.importantInfo' | transloco }}</h2>
            <div class="consejo">
              <mat-icon aria-hidden="true">my_location</mat-icon>
              <div><p class="nx-text-small-strong">{{ 'workSites.form.gpsAccuracy' | transloco }}</p><p class="nx-text-small">{{ 'workSites.form.gpsAccuracyText' | transloco }}</p></div>
            </div>
            <div class="consejo">
              <mat-icon aria-hidden="true">fingerprint</mat-icon>
              <div><p class="nx-text-small-strong">{{ 'workSites.form.biometrics' | transloco }}</p><p class="nx-text-small">{{ 'workSites.form.biometricsText' | transloco }}</p></div>
            </div>
          </section>

          @if (isEdit() && site(); as s) {
            <section class="nx-panel">
              <div class="titulo">
                <mat-icon aria-hidden="true">location_on</mat-icon>
                <h2 class="nx-text-heading-4">{{ s.name }}</h2>
                <app-status-chip [status]="s.status" [label]="'status.' + s.status | transloco" />
              </div>
              <dl class="nx-datos">
                <div class="nx-dato"><dt class="nx-text-heading-6">{{ 'common.code' | transloco }}</dt><dd class="nx-text-code">{{ s.code }}</dd></div>
              </dl>
            </section>
            <section class="nx-panel">
              <h2 class="nx-text-heading-4">{{ 'workSites.form.statusTitle' | transloco }}</h2>
              <p class="nx-text-small nx-sec">{{ 'workSites.form.statusActiveText' | transloco }}</p>
              <button mat-stroked-button type="button" (click)="toggleStatus(s)">
                <mat-icon>{{ s.status === 'ACTIVE' ? 'block' : 'check_circle' }}</mat-icon>
                {{ (s.status === 'ACTIVE' ? 'workSites.deactivate' : 'workSites.activate') | transloco }}
              </button>
            </section>
            <section class="nx-panel">
              <h2 class="nx-text-heading-4">{{ 'workSites.geofenceQr' | transloco }}</h2>
              <p class="nx-text-small nx-sec">{{ 'workSites.form.geofenceText' | transloco }}</p>
              <a mat-stroked-button [routerLink]="['/work-sites', s.id, 'geofence']"><mat-icon>my_location</mat-icon>{{ 'workSites.form.goToGeofence' | transloco }}</a>
            </section>
          }
        </div>
      </div>
    }
  `,
})
export class WorkSiteFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(WorkSiteService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);

  protected readonly siteId = this.route.snapshot.paramMap.get('id');
  protected readonly isEdit = computed(() => !!this.siteId);

  protected readonly site = signal<WorkSite | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal(false);
  /** Rechazo del backend (código repetido…), visible en un aviso del formulario. */
  protected readonly problem = signal<string | null>(null);
  /** Se intentó guardar sin marcar la ubicación en el mapa. */
  protected readonly missingLocation = signal(false);

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

  private readonly position = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  /** «Latitud, longitud» en un solo campo de lectura; se cambia arrastrando el punto del mapa. */
  protected readonly latLng = computed(() => {
    const { latitude, longitude } = this.position();
    return latitude != null && longitude != null ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : '';
  });

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
          this.error.set(true);
          this.loading.set(false);
        },
      });
    }
  }

  protected setPosition(position: { latitude: number; longitude: number }): void {
    this.form.patchValue({ latitude: position.latitude, longitude: position.longitude });
    this.form.markAsDirty();
    this.missingLocation.set(false);
  }

  /** mat-select no muestra una opción con valor null: el tri-estado se presenta como texto. */
  protected policyValue(value: PolicyOverride): 'inherit' | 'yes' | 'no' {
    return value === null || value === undefined ? 'inherit' : value ? 'yes' : 'no';
  }

  protected setPolicy(control: 'requirePhoto' | 'requireBiometric', value: 'inherit' | 'yes' | 'no'): void {
    this.form.controls[control].setValue(value === 'inherit' ? null : value === 'yes');
    this.form.markAsDirty();
  }

  protected cancel(): void {
    void this.router.navigate(['/work-sites']);
  }

  protected toggleStatus(site: WorkSite): void {
    const next = site.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.service.setStatus(site.id, next).subscribe({
      next: (updated) => {
        this.site.set(updated);
        this.notify.success(this.transloco.translate(next === 'INACTIVE' ? 'workSites.deactivated' : 'workSites.activated'));
      },
      error: () => this.notify.error(this.transloco.translate('common.statusError')),
    });
  }

  protected save(): void {
    this.missingLocation.set(this.form.controls.latitude.value == null || this.form.controls.longitude.value == null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.problem.set(null);
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
      error: (err) => {
        this.saving.set(false);
        this.problem.set(localizedProblem(this.transloco, err, 'workSites.form.saveError'));
      },
    });
  }
}
