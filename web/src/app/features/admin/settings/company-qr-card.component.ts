import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
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
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
    AppDatePipe,
  ],
  template: `
    <section class="nx-panel">
      <h2 class="nx-text-heading-3">{{ 'companyQr.title' | transloco }}</h2>
      <p class="nx-text-small nx-sec" [innerHTML]="'companyQr.text' | transloco"></p>

      @if (qr(); as q) {
        @if (qrImage(); as img) {
          <div class="nx-qr"><img [src]="img" [alt]="'companyQr.title' | transloco" /></div>
        }
        <div class="nx-fila-indicadores">
          <span class="nx-text-small">{{ 'geofence.expiresShort' | transloco }} <span class="nx-text-numeric">{{ q.expiresAt | appDate: 'dd/MM/yyyy HH:mm' }}</span></span>
          <span class="nx-chip nx-chip--success">{{ 'geofence.valid' | transloco }}</span>
        </div>
      }

      <form [formGroup]="qrForm" (ngSubmit)="generate()" class="qr-form">
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
        <button mat-stroked-button type="submit" [disabled]="busy() || qrForm.invalid">
          {{ (qr() ? 'geofence.rotate' : 'geofence.generate') | transloco }}
        </button>
      </form>
    </section>
  `,
  styles: [
    `
      h2, p { margin: var(--nx-space-0); }
      .qr-form { display: flex; flex-direction: column; align-items: flex-start; gap: var(--nx-space-gap-related); }
      .nx-qr { padding: var(--nx-space-2); animation: nx-fade var(--nx-motion-duration-medium) var(--nx-motion-easing-enter); }
      .nx-qr img { display: block; width: 100%; height: auto; }
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
