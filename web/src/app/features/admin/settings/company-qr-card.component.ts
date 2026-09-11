import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { toDataURL } from 'qrcode';

import { NotificationService } from '../../../core/ui/notification.service';
import { QrRequest, QrToken } from '../work-sites/geofence/geofence.models';
import { CompanyQrService } from './company-qr.service';

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
  ],
  template: `
    <mat-card class="qr-card">
      <mat-card-content>
        <div class="card-head"><mat-icon>qr_code_2</mat-icon><h3>QR de empresa</h3></div>
        <p class="muted sub">
          Cartel único para toda la empresa, sin centro de trabajo. Quien lo escanee registrará su
          asistencia con foto y ubicación, pero <b>sin validación de geocerca</b>. Generar uno nuevo
          deja el anterior inservible de inmediato.
        </p>

        <form [formGroup]="qrForm" (ngSubmit)="generate()" class="qr-form">
          <mat-button-toggle-group formControlName="mode" aria-label="Modo de vigencia">
            <mat-button-toggle value="minutes">Minutos</mat-button-toggle>
            <mat-button-toggle value="date">Fecha de expiración</mat-button-toggle>
          </mat-button-toggle-group>

          @if (qrForm.controls.mode.value === 'minutes') {
            <mat-form-field appearance="outline" style="width:180px">
              <mat-label>Vigencia (min)</mat-label>
              <input matInput type="number" min="1" max="1440" step="1" formControlName="ttlMinutes" />
              <mat-hint>1 a 1440 minutos (máx. 24 h)</mat-hint>
            </mat-form-field>
          } @else {
            <mat-form-field appearance="outline" style="width:220px">
              <mat-label>Expira el</mat-label>
              <input matInput type="datetime-local" formControlName="expiresAt" />
              <mat-hint>Para vigencias de días, semanas o meses</mat-hint>
            </mat-form-field>
          }

          <button mat-flat-button color="primary" type="submit" [disabled]="busy() || qrForm.invalid">
            <mat-icon>qr_code_2</mat-icon> Generar / rotar QR
          </button>
        </form>

        @if (qr(); as q) {
          <div class="qr-out">
            @if (qrImage(); as img) {
              <img [src]="img" alt="QR de empresa" />
            }
            <div class="muted">Vence: {{ q.expiresAt }}</div>
            <textarea readonly rows="3">{{ q.token }}</textarea>
          </div>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      .qr-card { margin-bottom: var(--sp-4); }
      .card-head { display: flex; align-items: center; gap: 10px; }
      .card-head mat-icon { color: var(--brand); }
      .card-head h3 { margin: 0; font-size: 1.05rem; font-weight: 700; }
      .sub { margin: 4px 0 12px; font-size: var(--font-small); }
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
        this.notify.error('Elegí una fecha de expiración.');
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
        this.notify.success('QR de empresa generado. El anterior ya no sirve.');
      },
      error: () => {
        this.busy.set(false);
        this.notify.error(
          'No se pudo generar el QR. Comprueba que el registro sin centro esté habilitado y guardado.',
        );
      },
    });
  }
}
