import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { AttendanceEvent, EVENT_LABELS, REJECTION_LABELS, STATUS_LABELS } from './attendance-events.models';
import { AttendanceEventsService } from './attendance-events.service';

/**
 * Detalle de una marcación con su evidencia fotográfica (RF-18, HU-13).
 *
 * <p>La imagen se carga desde una URL prefirmada de vida corta que se pide al abrir el diálogo:
 * incluirla en el listado no serviría de nada porque caducaría antes de que nadie la use.
 */
@Component({
  selector: 'app-attendance-detail-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title>{{ eventLabel(data.eventType) }}</h2>
    <mat-dialog-content>
      <div class="meta">
        <div class="row"><span class="k">Colaborador</span><span class="v">{{ data.employeeName || '—' }}</span></div>
        <div class="row"><span class="k">N.º de empleado</span><span class="v">{{ data.employeeCode || '—' }}</span></div>
        <div class="row">
          <span class="k">Centro</span>
          <span class="v">
            @if (data.siteless) {
              Sin centro <em>· registro sin validación de geocerca</em>
            } @else {
              {{ data.workSite || '—' }}
            }
          </span>
        </div>
        <div class="row"><span class="k">Fecha y hora</span><span class="v mono">{{ fmt(data.serverTime) }}</span></div>
        <div class="row">
          <span class="k">Estado</span>
          <span class="v">
            {{ statusLabel(data.status) }}
            @if (data.rejectionReason) { <em>· {{ rejectionLabel(data.rejectionReason) }}</em> }
          </span>
        </div>
        @if (data.gpsAccuracyM != null) {
          <div class="row"><span class="k">Precisión GPS</span><span class="v">±{{ data.gpsAccuracyM }} m</span></div>
        }
        @if (data.distanceToSiteM != null) {
          <div class="row"><span class="k">Distancia al centro</span><span class="v">{{ data.distanceToSiteM }} m</span></div>
        }
        <div class="row">
          <span class="k">Biometría</span>
          <span class="v">{{ data.biometricVerified ? 'Verificada' : 'No verificada' }}</span>
        </div>
        @if (data.source) {
          <div class="row">
            <span class="k">Origen</span>
            <span class="v">{{ data.source === 'OFFLINE_SYNC' ? 'Sincronizado sin conexión' : 'En línea' }}</span>
          </div>
        }
      </div>

      <h3 class="ph-title">Evidencia fotográfica</h3>
      @if (!data.hasEvidence) {
        <p class="ph-empty"><mat-icon>no_photography</mat-icon> Este registro no tiene foto asociada.</p>
      } @else if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      } @else if (error()) {
        <p class="ph-empty error-text"><mat-icon>error_outline</mat-icon> {{ error() }}</p>
      } @else if (url()) {
        <img class="evidence" [src]="url()" alt="Evidencia fotográfica del registro" />
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .meta { display: grid; gap: 2px; margin-bottom: var(--sp-4); min-width: 320px; }
      .row { display: flex; justify-content: space-between; gap: var(--sp-4); padding: 5px 0; font-size: var(--font-small); }
      .k { color: var(--text-muted); }
      .v { font-weight: 600; text-align: right; }
      .mono { font-variant-numeric: tabular-nums; }
      .ph-title { margin: 0 0 var(--sp-2); font-size: var(--font-body); font-weight: 700; }
      .ph-empty { display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: var(--font-small); }
      .evidence { display: block; width: 100%; max-width: 420px; border-radius: 10px; border: 1px solid var(--border); }
    `,
  ],
})
export class AttendanceDetailDialogComponent {
  protected readonly data = inject<AttendanceEvent>(MAT_DIALOG_DATA);
  private readonly service = inject(AttendanceEventsService);

  protected readonly url = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    if (this.data.hasEvidence) {
      this.loadEvidence();
    }
  }

  private loadEvidence(): void {
    this.loading.set(true);
    this.service.evidenceUrl(this.data.recordId, this.data.serverTime).subscribe({
      next: (r) => {
        this.url.set(r.url);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar la evidencia.');
        this.loading.set(false);
      },
    });
  }

  protected eventLabel(code: string): string {
    return EVENT_LABELS[code] ?? code;
  }

  protected statusLabel(code: string): string {
    return STATUS_LABELS[code] ?? code;
  }

  protected rejectionLabel(code: string): string {
    return REJECTION_LABELS[code] ?? code;
  }

  protected fmt(iso: string): string {
    return new Date(iso).toLocaleString('es-MX');
  }
}
