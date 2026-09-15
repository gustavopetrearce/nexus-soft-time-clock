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
  ],
  template: `
    <app-breadcrumb
      [items]="[
        { label: 'Organización', route: '/work-sites' },
        { label: 'Centros de trabajo', route: '/work-sites' },
        { label: isEdit() ? (site()?.name ?? '') : 'Nuevo centro de trabajo' },
      ]"
    />
    <app-page-header [title]="isEdit() ? 'Editar centro de trabajo' : 'Nuevo centro de trabajo'" />

    @if (loading()) { <mat-progress-bar mode="indeterminate" style="margin-bottom:16px" /> }
    @if (error()) { <p class="error-text">{{ error() }}</p> }

    <div class="form-page-layout">
      <div class="form-page-main">
        <h3 class="form-section-title">Información del centro de trabajo</h3>
        <form [formGroup]="form">
          <div style="display:flex; gap: var(--sp-5); align-items:flex-start; flex-wrap:wrap">
            <div style="flex: 1 1 320px; min-width:280px">
              <div class="form-grid-2">
                <mat-form-field appearance="outline" class="drawer-field">
                  <mat-label>Código</mat-label>
                  <input matInput formControlName="code" />
                  <mat-hint>Código único del centro de trabajo.</mat-hint>
                </mat-form-field>
                <mat-form-field appearance="outline" class="drawer-field">
                  <mat-label>Nombre del centro</mat-label>
                  <input matInput formControlName="name" />
                  <mat-hint>Nombre con el que se identifica el centro.</mat-hint>
                </mat-form-field>
              </div>
              <mat-form-field appearance="outline" class="drawer-field">
                <mat-label>Dirección</mat-label>
                <input matInput formControlName="address" />
                <mat-hint>Dirección completa del centro de trabajo (opcional).</mat-hint>
              </mat-form-field>
              <div class="form-grid-2">
                <mat-form-field appearance="outline" class="drawer-field">
                  <mat-label>Latitud</mat-label>
                  <input matInput type="number" step="any" formControlName="latitude" readonly />
                  <mat-hint>Coordenada en formato decimal.</mat-hint>
                </mat-form-field>
                <mat-form-field appearance="outline" class="drawer-field">
                  <mat-label>Longitud</mat-label>
                  <input matInput type="number" step="any" formControlName="longitude" readonly />
                  <mat-hint>Coordenada en formato decimal.</mat-hint>
                </mat-form-field>
              </div>
            </div>
            <div style="flex: 0 0 300px; min-width:260px">
              <p class="row-title" style="margin:0 0 var(--sp-2)">Ubicación en el mapa</p>
              <app-map-inline
                #map
                style="display:block; height:220px"
                [latitude]="form.controls.latitude.value"
                [longitude]="form.controls.longitude.value"
                [radiusMeters]="form.controls.gpsAccuracyMaxM.value ?? 50"
                (positionChange)="setPosition($event)"
              />
              <p class="row-desc" style="margin: var(--sp-2) 0">Radio de precisión: {{ form.controls.gpsAccuracyMaxM.value ?? 50 }} m</p>
              <button mat-stroked-button type="button" (click)="map.centerOnPoint()">
                <mat-icon>my_location</mat-icon> Centrar mapa
              </button>
            </div>
          </div>
          <div class="form-grid-2">
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>Zona horaria</mat-label>
              <mat-select formControlName="timezone">
                <mat-option [value]="''">Heredar de la empresa</mat-option>
                @for (tz of tzOptions(); track tz.value) {
                  <mat-option [value]="tz.value">{{ tz.label }}</mat-option>
                }
              </mat-select>
              <mat-hint>Zona horaria del centro de trabajo (opcional).</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>Precisión GPS máx (m)</mat-label>
              <input matInput type="number" formControlName="gpsAccuracyMaxM" />
              <mat-hint>Radio máximo de validación de ubicación (opcional).</mat-hint>
            </mat-form-field>
          </div>
          <div class="policy-row">
            <div>
              <p class="row-title">Foto al registrar</p>
              <p class="row-desc">Los usuarios deben tomar foto al registrar asistencia.</p>
            </div>
            <mat-button-toggle-group formControlName="requirePhoto" aria-label="Política de foto">
              <mat-button-toggle [value]="null">Heredar</mat-button-toggle>
              <mat-button-toggle [value]="true">Sí</mat-button-toggle>
              <mat-button-toggle [value]="false">No</mat-button-toggle>
            </mat-button-toggle-group>
          </div>
          <div class="policy-row">
            <div>
              <p class="row-title">Verificación biométrica</p>
              <p class="row-desc">Se requiere validación biométrica al registrar.</p>
            </div>
            <mat-button-toggle-group formControlName="requireBiometric" aria-label="Política de biometría">
              <mat-button-toggle [value]="null">Heredar</mat-button-toggle>
              <mat-button-toggle [value]="true">Sí</mat-button-toggle>
              <mat-button-toggle [value]="false">No</mat-button-toggle>
            </mat-button-toggle-group>
          </div>
          <p class="row-desc policy-hint">
            <mat-icon>info</mat-icon>
            <span>«Heredar» aplica lo definido en Configuración → Políticas de registro.</span>
          </p>
        </form>

        <div class="form-callout">
          <mat-icon>info</mat-icon>
          <div>
            <p class="row-title">Importante</p>
            <p class="row-desc">El centro de trabajo debe tener coordenadas correctas. La precisión GPS define el radio donde se permitirá fichar.</p>
          </div>
        </div>

        <div class="form-actions">
          <button mat-button type="button" (click)="cancel()">Cancelar</button>
          <button mat-flat-button color="primary" [disabled]="!formValid() || saving()" (click)="save()">
            <mat-icon>save</mat-icon> {{ isEdit() ? 'Guardar cambios' : 'Guardar centro' }}
          </button>
        </div>
      </div>

      <div class="form-page-side">
        <div class="info-card tip">
          <h3 class="info-card-title">Información importante</h3>
          <div class="icon-row">
            <mat-icon>my_location</mat-icon>
            <div>
              <p class="row-title">Precisión GPS</p>
              <p class="row-desc">Define el radio máximo (en metros) donde se permitirá registrar asistencia.</p>
            </div>
          </div>
          <div class="icon-row">
            <mat-icon>fingerprint</mat-icon>
            <div>
              <p class="row-title">Biometría</p>
              <p class="row-desc">Obligatoria si está habilitada. Asegura que quien ficha es el colaborador registrado.</p>
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
            <div class="info-row"><span class="k">Código</span><span class="v">{{ s.code }}</span></div>
          </div>
          <div class="info-card">
            <h3 class="info-card-title">Estado del centro</h3>
            <p class="muted" style="margin:0 0 var(--sp-3)">
              @if (s.status === 'ACTIVE') { Solo los centros activos permiten registrar asistencia. }
              @else { Este centro no permite fichajes mientras no esté activo. }
            </p>
            <button mat-stroked-button (click)="toggleStatus(s)">
              {{ s.status === 'ACTIVE' ? 'Desactivar centro' : 'Activar centro' }}
            </button>
          </div>
          <div class="info-card">
            <h3 class="info-card-title">Geocerca y QR</h3>
            <p class="muted" style="margin:0 0 var(--sp-3)">Define el radio de fichaje y genera el QR de acceso.</p>
            <a mat-stroked-button [routerLink]="['/work-sites', s.id, 'geofence']">
              <mat-icon>my_location</mat-icon> Ir a geocerca y QR
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
          this.error.set('No se pudo cargar el centro de trabajo.');
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
          title: next === 'INACTIVE' ? 'Desactivar centro' : 'Activar centro',
          message: `¿Confirmás cambiar el estado de "${site.name}" a ${next}?`,
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
            this.notify.success('Estado actualizado.');
          },
          error: () => this.notify.error('No se pudo cambiar el estado.'),
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
        this.notify.success(this.siteId ? 'Centro actualizado.' : 'Centro creado.');
        void this.router.navigate(['/work-sites']);
      },
      error: () => {
        this.saving.set(false);
        this.notify.error('No se pudo guardar el centro.');
      },
    });
  }
}
