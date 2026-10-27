import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { toDataURL } from 'qrcode';

import { NotificationService } from '../../../core/ui/notification.service';
import { QrRequest, QrToken } from '../work-sites/geofence/geofence.models';
import { CompanyQrService } from './company-qr.service';
import { AppDatePipe } from '../../../core/i18n/app-date.pipe';

type QrDurationMode = 'minutes' | 'date';

/**
 * Emisión del QR de empresa (camino de registro sin centro de trabajo). Espejo de la tarjeta de QR
 * de la pantalla de geocerca, con dos diferencias que importan: no hay centro al que atarlo y
 * rotarlo **invalida** de verdad el anterior, porque este cartel sirve desde cualquier ubicación y
 * no tiene una geocerca detrás que lo respalde.
 */
@Component({
  selector: 'app-company-qr-card',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
    AppDatePipe,
  ],
  template: `
    <mat-card class="qr-card">
      <mat-card-content>
        <div class="card-head"><mat-icon>qr_code_2</mat-icon><h3>{{ 'companyQr.title' | transloco }}</h3></div>
        <p class="muted sub" [innerHTML]="'companyQr.text' | transloco"></p>

        <form [formGroup]="qrForm" (ngSubmit)="generate()" class="qr-form">
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

          <button mat-flat-button color="primary" type="submit" [disabled]="busy() || qrForm.invalid">
            <mat-icon>qr_code_2</mat-icon> {{ 'geofence.generate' | transloco }}
          </button>
        </form>

        @if (qr(); as q) {
          <div class="qr-out">
            @if (qrImage(); as img) {
              <img [src]="img" [alt]="'companyQr.title' | transloco" />
            }
            <div class="muted">{{ 'geofence.expires' | transloco: { date: (q.expiresAt | appDate: 'medium') } }}</div>
            <textarea readonly rows="3">{{ q.token }}</textarea>
          </div>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      .qr-card { margin-bottom: var(--nx-space-4); }
      .card-head { display: flex; align-items: center; gap: 10px; }
      .card-head mat-icon { color: var(--nx-color-action-primary); }
      .card-head h3 { margin: 0; font-size: 1.05rem; font-weight: var(--nx-font-weight-bold); }
      .sub { margin: 4px 0 12px; font-size: var(--nx-text-small-size); }
      .qr-form { display: flex; gap: 12px; flex-wrap: wrap; align-items: baseline; }
      .qr-out { margin-top: 16px; text-align: center; }
      .qr-out img { width: 220px; height: 220px; }
      .qr-out textarea { width: 100%; margin-top: 8px; font-family: monospace; font-size: 0.75rem; }
    `,
  ],
})
export class CompanyQrCardComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(CompanyQrService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);

  protected readonly busy = signal(false);
  protected readonly qr = signal<QrToken | null>(null);
  protected readonly qrImage = signal<string | null>(null);

  protected readonly qrForm = this.fb.nonNullable.group({
    mode: this.fb.nonNullable.control<QrDurationMode>('minutes'),
    ttlMinutes: this.fb.nonNullable.control(480, [Validators.min(1), Validators.max(1440)]),
    expiresAt: this.fb.nonNullable.control(''),
  });

  protected generate(): void {
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

    this.busy.set(true);
    this.service.generate(request).subscribe({
      next: (token) => {
        this.qr.set(token);
        void toDataURL(token.token, { width: 220 }).then((url) => this.qrImage.set(url));
        this.busy.set(false);
        this.notify.success(this.transloco.translate('companyQr.generated'));
      },
      error: () => {
        this.busy.set(false);
        this.notify.error(this.transloco.translate('companyQr.error'));
      },
    });
  }
}
