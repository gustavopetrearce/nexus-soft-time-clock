import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import * as L from 'leaflet';
import { toDataURL } from 'qrcode';

import { NotificationService } from '../../../../core/ui/notification.service';
import { PageHeaderComponent } from '../../../../core/ui/page-header.component';
import { WorkSiteService } from '../work-site.service';
import { QrRequest, QrToken } from './geofence.models';
import { GeofenceService } from './geofence.service';
import { AppDatePipe } from '../../../../core/i18n/app-date.pipe';
import { cssToken } from '../../../../core/ui/css-token';

type QrDurationMode = 'minutes' | 'date';

/**
 * Geocerca circular por centro (RF-10) con selector de mapa (clic para fijar el centro),
 * y generación/rotación del QR firmado del centro (RF-14). Requiere {@code geofence:manage}.
 */
@Component({
  selector: 'app-geofence',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    PageHeaderComponent,
    TranslocoPipe,
    AppDatePipe,
  ],
  template: `
    <app-page-header [title]="'geofence.title' | transloco" [subtitle]="'geofence.subtitle' | transloco">
      <a mat-stroked-button routerLink="/work-sites"><mat-icon>arrow_back</mat-icon> {{ 'common.back' | transloco }}</a>
    </app-page-header>

    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    @if (error()) { <p class="error-text">{{ error() }}</p> }

    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <mat-card style="flex:1 1 480px">
        <mat-card-header><mat-card-title>{{ 'geofence.circular' | transloco }}</mat-card-title></mat-card-header>
        <mat-card-content>
          <p class="muted">{{ 'geofence.mapHint' | transloco }}</p>
          <div #mapEl style="height:340px;border-radius:8px;overflow:hidden"></div>
          <form [formGroup]="form" (ngSubmit)="save()" style="display:flex;gap:12px;flex-wrap:wrap;align-items:baseline;margin-top:12px">
            <mat-form-field appearance="outline" style="width:150px">
              <mat-label>{{ 'workSites.latitude' | transloco }}</mat-label>
              <input matInput type="number" step="any" formControlName="latitude" (change)="syncMap()" />
            </mat-form-field>
            <mat-form-field appearance="outline" style="width:150px">
              <mat-label>{{ 'workSites.longitude' | transloco }}</mat-label>
              <input matInput type="number" step="any" formControlName="longitude" (change)="syncMap()" />
            </mat-form-field>
            <mat-form-field appearance="outline" style="width:150px">
              <mat-label>{{ 'geofence.radius' | transloco }}</mat-label>
              <input matInput type="number" step="any" formControlName="radiusM" (change)="syncMap()" />
            </mat-form-field>
            <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || loading()">
              {{ 'geofence.save' | transloco }}
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <mat-card style="flex:1 1 320px">
        <mat-card-header><mat-card-title>{{ 'geofence.qrTitle' | transloco }}</mat-card-title></mat-card-header>
        <mat-card-content>
          <p class="muted">{{ 'geofence.qrText' | transloco }}</p>
          <form [formGroup]="qrForm" (ngSubmit)="generateQr()" style="display:flex;flex-direction:column;gap:12px;align-items:flex-start">
            <mat-button-toggle-group formControlName="mode" [attr.aria-label]="'geofence.validityMode' | transloco">
              <mat-button-toggle value="minutes">{{ 'geofence.minutes' | transloco }}</mat-button-toggle>
              <mat-button-toggle value="date">{{ 'geofence.expiryDate' | transloco }}</mat-button-toggle>
            </mat-button-toggle-group>

            @if (qrForm.controls.mode.value === 'minutes') {
              <mat-form-field appearance="outline" style="width:180px">
                <mat-label>{{ 'geofence.validityMinutes' | transloco }}</mat-label>
                <input matInput type="number" min="1" max="1440" step="1" formControlName="ttlMinutes" />
                <mat-hint>{{ 'geofence.validityHint' | transloco }}</mat-hint>
              </mat-form-field>
            } @else {
              <mat-form-field appearance="outline" style="width:220px">
                <mat-label>{{ 'geofence.expiresOn' | transloco }}</mat-label>
                <input matInput type="datetime-local" formControlName="expiresAt" />
                <mat-hint>{{ 'geofence.expiresHint' | transloco }}</mat-hint>
              </mat-form-field>
            }

            <button mat-flat-button color="primary" type="submit" [disabled]="loading() || qrForm.invalid">
              <mat-icon>qr_code_2</mat-icon> {{ 'geofence.generate' | transloco }}
            </button>
          </form>
          @if (qr(); as q) {
            <div style="margin-top:16px;text-align:center">
              @if (qrImage(); as img) {
                <img [src]="img" [alt]="'geofence.qrTitle' | transloco" style="width:220px;height:220px" />
              }
              <div class="muted" style="margin-top:8px">{{ 'geofence.expires' | transloco: { date: (q.expiresAt | appDate: 'medium') } }}</div>
              <textarea readonly style="width:100%;margin-top:8px;font-family:monospace;font-size:.75rem" rows="3">{{ q.token }}</textarea>
            </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export class GeofenceComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl') private mapEl!: ElementRef<HTMLDivElement>;

  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly geofence = inject(GeofenceService);
  private readonly workSites = inject(WorkSiteService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);

  private readonly workSiteId = this.route.snapshot.paramMap.get('id') ?? '';
  private map?: L.Map;
  private centerMarker?: L.CircleMarker;
  private radiusCircle?: L.Circle;

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly qr = signal<QrToken | null>(null);
  protected readonly qrImage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    latitude: this.fb.nonNullable.control(0, [Validators.required]),
    longitude: this.fb.nonNullable.control(0, [Validators.required]),
    radiusM: this.fb.nonNullable.control(100, [Validators.required, Validators.min(1)]),
  });

  protected readonly qrForm = this.fb.nonNullable.group({
    mode: this.fb.nonNullable.control<QrDurationMode>('minutes'),
    ttlMinutes: this.fb.nonNullable.control(2, [Validators.min(1), Validators.max(1440)]),
    expiresAt: this.fb.nonNullable.control(''),
  });

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement).setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(this.map);
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.form.patchValue({ latitude: e.latlng.lat, longitude: e.latlng.lng });
      this.syncMap();
    });
    this.load();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private load(): void {
    if (!this.workSiteId) {
      return;
    }
    this.loading.set(true);
    // Centro por defecto: ubicación del propio centro de trabajo.
    this.workSites.get(this.workSiteId).subscribe({
      next: (site) => {
        this.form.patchValue({ latitude: site.latitude, longitude: site.longitude });
        this.syncMap(15);
        // Geocerca existente (si la hay) tiene prioridad.
        this.geofence.get(this.workSiteId).subscribe({
          next: (g) => {
            this.form.patchValue({ latitude: g.latitude, longitude: g.longitude, radiusM: g.radiusM });
            this.syncMap(16);
            this.loading.set(false);
          },
          error: () => this.loading.set(false), // sin geocerca previa
        });
      },
      error: () => {
        this.error.set(this.transloco.translate('workSites.form.loadError'));
        this.loading.set(false);
      },
    });
  }

  /** Refleja los valores del formulario en el mapa (marcador de centro + círculo de radio). */
  protected syncMap(zoom?: number): void {
    if (!this.map) {
      return;
    }
    const { latitude, longitude, radiusM } = this.form.getRawValue();
    const center: L.LatLngExpression = [latitude, longitude];
    if (!this.centerMarker) {
      this.centerMarker = L.circleMarker(center, { radius: 6, color: cssToken('color-action-primary') }).addTo(this.map);
      this.radiusCircle = L.circle(center, { radius: radiusM, color: cssToken('color-action-primary'), fillOpacity: 0.1 }).addTo(this.map);
    } else {
      this.centerMarker.setLatLng(center);
      this.radiusCircle?.setLatLng(center);
      this.radiusCircle?.setRadius(radiusM);
    }
    this.map.setView(center, zoom ?? this.map.getZoom());
  }

  protected save(): void {
    if (this.form.invalid) {
      return;
    }
    this.loading.set(true);
    this.geofence.upsert(this.workSiteId, this.form.getRawValue()).subscribe({
      next: () => {
        this.notify.success(this.transloco.translate('geofence.saved'));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.notify.error(this.transloco.translate('geofence.saveError'));
      },
    });
  }

  protected generateQr(): void {
    if (this.qrForm.invalid) {
      return;
    }
    const raw = this.qrForm.getRawValue();
    let request: QrRequest;
    if (raw.mode === 'date') {
      if (!raw.expiresAt) {
        this.notify.error(this.transloco.translate('geofence.pickDate'));
        return;
      }
      request = { expiresAt: new Date(raw.expiresAt).toISOString() };
    } else {
      request = { ttlMinutes: raw.ttlMinutes };
    }
    this.loading.set(true);
    this.geofence.generateQr(this.workSiteId, request).subscribe({
      next: (token) => {
        this.qr.set(token);
        void toDataURL(token.token, { width: 220 }).then((url) => this.qrImage.set(url));
        this.notify.success(this.transloco.translate('geofence.qrGenerated'));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.notify.error(this.transloco.translate('geofence.qrError'));
      },
    });
  }
}
