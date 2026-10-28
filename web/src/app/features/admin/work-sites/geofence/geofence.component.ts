import { AfterViewInit, Component, ElementRef, OnDestroy, TemplateRef, ViewChild, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import * as L from 'leaflet';
import { toDataURL } from 'qrcode';

import { AlertComponent } from '../../../../core/ui/alert.component';
import { ConfirmDialogComponent } from '../../../../core/ui/confirm-dialog.component';
import { EmptyStateComponent } from '../../../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../../../core/ui/loading-bar.component';
import { NotificationService } from '../../../../core/ui/notification.service';
import { PageHeaderComponent } from '../../../../core/ui/page-header.component';
import { WorkSiteService } from '../work-site.service';
import { QrRequest, QrToken } from './geofence.models';
import { GeofenceService } from './geofence.service';
import { AppDatePipe } from '../../../../core/i18n/app-date.pipe';
import { cssToken } from '../../../../core/ui/css-token';

type QrDurationMode = 'minutes' | 'date';

/**
 * P27 · Geocerca y QR (5 + 7): radio de la geocerca circular (RF-10, clic en el mapa para fijar el
 * centro) y el QR firmado del centro (RF-14) con su vencimiento, Vigente/Vencido, Rotar (confirmado,
 * S01), Mostrar e Imprimir. El backend no devuelve el QR vigente: se ve el que se genera aquí.
 */
@Component({
  selector: 'app-geofence',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    AlertComponent,
    EmptyStateComponent,
    LoadingBarComponent,
    PageHeaderComponent,
    TranslocoPipe,
    AppDatePipe,
  ],
  styles: [
    `
      h2, p { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      .nx-panel > button, .nx-panel > form > button { align-self: flex-start; }
      form { display: flex; flex-direction: column; gap: var(--nx-space-gap-related); }
      .nx-mapa--geocerca { display: block; z-index: 0; }
      .nx-qr { padding: var(--nx-space-2); animation: nx-fade var(--nx-motion-duration-medium) var(--nx-motion-easing-enter); }
      .nx-qr img { display: block; width: 100%; height: auto; }
      .nx-fila-botones { display: flex; flex-wrap: wrap; gap: var(--nx-space-gap-inline); }
      .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
    `,
  ],
  template: `
    <div class="nx-regresar">
      <a mat-button routerLink="/work-sites"><mat-icon>arrow_back</mat-icon>{{ 'common.back' | transloco }}</a>
    </div>
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'geofence.title' | transloco" [subtitle]="siteLabel()" />

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
        <button mat-stroked-button type="button" (click)="load()">{{ 'common.retry' | transloco }}</button>
      </app-empty-state>
    }

    <div class="nx-g-5-7" [hidden]="error()">
      <div class="nx-pila">
        <section class="nx-panel" [attr.aria-label]="'geofence.config' | transloco">
          <form [formGroup]="form" (ngSubmit)="save()" novalidate>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'geofence.radius' | transloco }}</mat-label>
              <input matInput type="number" min="1" step="1" formControlName="radiusM" required (input)="syncMap()" />
              <mat-hint>{{ 'geofence.mapHint' | transloco }}</mat-hint>
            </mat-form-field>
            @if (form.controls.radiusM.invalid && form.controls.radiusM.touched) {
              <app-alert tone="error">{{ 'geofence.radiusInvalid' | transloco }}</app-alert>
            }
            <button mat-flat-button type="submit" [disabled]="saving()" [attr.aria-busy]="saving()">
              @if (saving()) { <span class="nx-spin" aria-hidden="true"></span> }
              {{ 'geofence.save' | transloco }}
            </button>
          </form>
        </section>

        <section class="nx-panel">
          <h2 class="nx-text-heading-4">{{ 'geofence.validity' | transloco }}</h2>
          <form [formGroup]="qrForm">
            <mat-button-toggle-group formControlName="mode" [attr.aria-label]="'geofence.validityMode' | transloco">
              <mat-button-toggle value="minutes">{{ 'geofence.minutes' | transloco }}</mat-button-toggle>
              <mat-button-toggle value="date">{{ 'geofence.expiryDate' | transloco }}</mat-button-toggle>
            </mat-button-toggle-group>
            @if (qrForm.controls.mode.value === 'minutes') {
              <mat-form-field appearance="outline">
                <mat-label>{{ 'geofence.validityMinutes' | transloco }}</mat-label>
                <input matInput type="number" min="1" max="1440" step="1" formControlName="ttlMinutes" />
                <mat-hint>{{ 'geofence.validityHint' | transloco }}</mat-hint>
              </mat-form-field>
            } @else {
              <mat-form-field appearance="outline">
                <mat-label>{{ 'geofence.expiresOn' | transloco }}</mat-label>
                <input matInput type="datetime-local" formControlName="expiresAt" />
                <mat-hint>{{ 'geofence.expiresHint' | transloco }}</mat-hint>
              </mat-form-field>
            }
          </form>
        </section>
      </div>

      <section class="nx-panel" [attr.aria-label]="'geofence.preview' | transloco">
        <div #mapEl class="nx-mapa nx-mapa--geocerca" role="img" [attr.aria-label]="'geofence.mapLabel' | transloco"></div>

        @if (qr(); as q) {
          @if (qrImage(); as img) {
            <div class="nx-qr"><img [src]="img" [alt]="'geofence.qrAlt' | transloco: { site: siteLabel() }" /></div>
          }
          <div class="nx-fila-indicadores">
            <span class="nx-text-small">{{ 'geofence.expiresShort' | transloco }} <span class="nx-text-numeric">{{ q.expiresAt | appDate: 'dd/MM/yyyy HH:mm' }}</span></span>
            @if (expired()) {
              <span class="nx-chip nx-chip--neutral"><mat-icon class="nx-icon--sm" aria-hidden="true">schedule</mat-icon>{{ 'geofence.expired' | transloco }}</span>
            } @else {
              <span class="nx-chip nx-chip--success">{{ 'geofence.valid' | transloco }}</span>
            }
          </div>
          <div class="nx-fila-botones">
            <button mat-stroked-button type="button" [disabled]="generating()" (click)="rotate()">{{ 'geofence.rotate' | transloco }}</button>
            <button mat-stroked-button type="button" (click)="show()"><mat-icon>visibility</mat-icon>{{ 'geofence.show' | transloco }}</button>
            <button mat-stroked-button type="button" (click)="print()"><mat-icon>print</mat-icon>{{ 'geofence.print' | transloco }}</button>
          </div>
        } @else {
          <app-empty-state icon="qr_code_2" [message]="'geofence.noQr' | transloco">
            <button mat-flat-button type="button" [disabled]="generating() || qrForm.invalid" (click)="generateQr()">
              @if (generating()) { <span class="nx-spin" aria-hidden="true"></span> }
              {{ 'geofence.generate' | transloco }}
            </button>
          </app-empty-state>
        }
      </section>
    </div>

    <ng-template #qrGrande>
      <div class="nx-capa__enc"><h2 class="nx-text-heading-3" mat-dialog-title>{{ siteLabel() }}</h2></div>
      <div class="nx-capa__cuerpo"><div class="nx-qr" style="width: 100%"><img [src]="qrImage()" [alt]="'geofence.qrAlt' | transloco: { site: siteLabel() }" /></div></div>
      <div class="nx-capa__pie"><button mat-button type="button" mat-dialog-close cdkFocusInitial>{{ 'common.close' | transloco }}</button></div>
    </ng-template>
  `,
})
export class GeofenceComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl') private mapEl!: ElementRef<HTMLDivElement>;
  @ViewChild('qrGrande') private qrGrande!: TemplateRef<unknown>;

  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly geofence = inject(GeofenceService);
  private readonly workSites = inject(WorkSiteService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly dialog = inject(MatDialog);

  private readonly workSiteId = this.route.snapshot.paramMap.get('id') ?? '';
  private map?: L.Map;
  private centerMarker?: L.CircleMarker;
  private radiusCircle?: L.Circle;

  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly saving = signal(false);
  protected readonly generating = signal(false);
  /** «Nombre · CÓDIGO» del centro, bajo el título. */
  protected readonly siteLabel = signal('');
  private readonly now = signal(Date.now());
  protected readonly expired = computed(() => {
    const q = this.qr();
    return !!q && Date.parse(q.expiresAt) <= this.now();
  });
  private clock?: ReturnType<typeof setInterval>;
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
    this.clock = setInterval(() => this.now.set(Date.now()), 30_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.clock);
    this.map?.remove();
  }

  protected load(): void {
    if (!this.workSiteId) {
      return;
    }
    this.loading.set(true);
    this.error.set(false);
    // Centro por defecto: ubicación del propio centro de trabajo.
    this.workSites.get(this.workSiteId).subscribe({
      next: (site) => {
        this.siteLabel.set(`${site.name} · ${site.code}`);
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
        this.error.set(true);
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
      const color = cssToken('color-action-primary');
      this.centerMarker = L.circleMarker(center, { radius: 6, color }).addTo(this.map);
      this.radiusCircle = L.circle(center, { radius: radiusM, color, fillColor: cssToken('color-action-primary-subtle'), fillOpacity: 0.5 }).addTo(this.map);
    } else {
      this.centerMarker.setLatLng(center);
      this.radiusCircle?.setLatLng(center);
      if (radiusM > 0) this.radiusCircle?.setRadius(radiusM);
    }
    this.map.setView(center, zoom ?? this.map.getZoom());
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.geofence.upsert(this.workSiteId, this.form.getRawValue()).subscribe({
      next: () => {
        this.notify.success(this.transloco.translate('geofence.saved'));
        this.saving.set(false);
      },
      error: () => {
        this.saving.set(false);
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
    this.generating.set(true);
    this.geofence.generateQr(this.workSiteId, request).subscribe({
      next: (token) => {
        this.qr.set(token);
        void toDataURL(token.token, { width: 220 }).then((url) => this.qrImage.set(url));
        this.notify.success(this.transloco.translate('geofence.qrGenerated'));
        this.generating.set(false);
      },
      error: () => {
        this.generating.set(false);
        this.notify.error(this.transloco.translate('geofence.qrError'));
      },
    });
  }

  /** Rotar invalida el QR actual: se confirma (S01) y el nuevo entra con un fundido. */
  protected rotate(): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: this.transloco.translate('geofence.rotateTitle', { site: this.siteLabel() }),
          message: this.transloco.translate('geofence.rotateMessage'),
          confirmText: this.transloco.translate('geofence.rotate'),
          color: 'warn',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) this.generateQr();
      });
  }

  protected show(): void {
    this.dialog.open(this.qrGrande, { ariaLabel: this.siteLabel() });
  }

  /** Imprime solo el QR, con el nombre del centro, en una ventana aparte. */
  protected print(): void {
    const img = this.qrImage();
    const win = img ? window.open('', '_blank', 'noopener=no') : null;
    if (!win || !img) return;
    const doc = win.document;
    doc.title = this.siteLabel();
    const heading = doc.createElement('h1');
    heading.textContent = this.siteLabel();
    const image = doc.createElement('img');
    image.src = img;
    image.style.width = '60%';
    doc.body.style.fontFamily = 'sans-serif';
    doc.body.style.textAlign = 'center';
    doc.body.append(heading, image);
    image.onload = () => {
      win.print();
      win.close();
    };
  }
}
