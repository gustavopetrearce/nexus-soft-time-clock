import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { LanguageService } from '../../core/i18n/language.service';
import { AttendanceEvent, eventLabel, recordStatusLabel, rejectionLabel } from './attendance-events.models';
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
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressBarModule, TranslocoPipe],
  template: `
    <h2 mat-dialog-title>{{ eventLabel(data.eventType) }}</h2>
    <mat-dialog-content>
      <div class="meta">
        <div class="row"><span class="k">{{ 'users.employee' | transloco }}</span><span class="v">{{ data.employeeName || '—' }}</span></div>
        <div class="row"><span class="k">{{ 'attendanceEvents.detail.employeeNo' | transloco }}</span><span class="v">{{ data.employeeCode || '—' }}</span></div>
        <div class="row">
          <span class="k">{{ 'scheduling.site' | transloco }}</span>
          <span class="v">
            @if (data.siteless) {
              {{ 'attendanceEvents.siteless' | transloco }} <em>· {{ 'attendanceEvents.detail.noGeofence' | transloco }}</em>
            } @else {
              {{ data.workSite || '—' }}
            }
          </span>
        </div>
        <div class="row"><span class="k">{{ 'attendanceEvents.col.date' | transloco }}</span><span class="v mono">{{ fmt(data.serverTime) }}</span></div>
        <div class="row">
          <span class="k">{{ 'common.status' | transloco }}</span>
          <span class="v">
            {{ statusLabel(data.status) }}
            @if (data.rejectionReason) { <em>· {{ rejectionLabel(data.rejectionReason) }}</em> }
          </span>
        </div>
        @if (data.gpsAccuracyM != null) {
          <div class="row"><span class="k">{{ 'workSites.form.gpsAccuracy' | transloco }}</span><span class="v">±{{ data.gpsAccuracyM }} m</span></div>
        }
        @if (data.distanceToSiteM != null) {
          <div class="row"><span class="k">{{ 'attendanceEvents.detail.distance' | transloco }}</span><span class="v">{{ data.distanceToSiteM }} m</span></div>
        }
        <div class="row">
          <span class="k">{{ 'workSites.form.biometrics' | transloco }}</span>
          <span class="v">{{ (data.biometricVerified ? 'attendanceEvents.detail.verified' : 'attendanceEvents.detail.notVerified') | transloco }}</span>
        </div>
        @if (data.source) {
          <div class="row">
            <span class="k">{{ 'attendanceEvents.detail.source' | transloco }}</span>
            <span class="v">{{ (data.source === 'OFFLINE_SYNC' ? 'attendanceEvents.detail.offline' : 'attendanceEvents.detail.online') | transloco }}</span>
          </div>
        }
      </div>

      <h3 class="ph-title">{{ 'attendanceEvents.detail.evidence' | transloco }}</h3>
      @if (!data.hasEvidence) {
        <p class="ph-empty"><mat-icon>no_photography</mat-icon> {{ 'attendanceEvents.detail.noPhoto' | transloco }}</p>
      } @else if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      } @else if (error()) {
        <p class="ph-empty error-text"><mat-icon>error_outline</mat-icon> {{ error() }}</p>
      } @else if (url()) {
        <img class="evidence" [src]="url()" [alt]="'attendanceEvents.detail.evidenceAlt' | transloco" />
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.close' | transloco }}</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .meta { display: grid; gap: 2px; margin-bottom: var(--nx-space-4); min-width: 320px; }
      .row { display: flex; justify-content: space-between; gap: var(--nx-space-4); padding: 5px 0; font-size: var(--nx-text-small-size); }
      .k { color: var(--nx-color-text-secondary); }
      .v { font-weight: var(--nx-font-weight-semibold); text-align: right; }
      .mono { font-variant-numeric: tabular-nums; }
      .ph-title { margin: 0 0 var(--nx-space-2); font-size: var(--nx-text-body-size); font-weight: var(--nx-font-weight-bold); }
      .ph-empty { display: flex; align-items: center; gap: 8px; color: var(--nx-color-text-secondary); font-size: var(--nx-text-small-size); }
      .evidence { display: block; width: 100%; max-width: 420px; border-radius: 10px; border: 1px solid var(--nx-color-border-default); }
    `,
  ],
})
export class AttendanceDetailDialogComponent {
  protected readonly data = inject<AttendanceEvent>(MAT_DIALOG_DATA);
  private readonly service = inject(AttendanceEventsService);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

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
        this.error.set(this.transloco.translate('attendanceEvents.detail.evidenceError'));
        this.loading.set(false);
      },
    });
  }

  protected eventLabel(code: string): string {
    return eventLabel(code);
  }

  protected statusLabel(code: string): string {
    return recordStatusLabel(code);
  }

  protected rejectionLabel(code: string): string {
    return rejectionLabel(code);
  }

  protected fmt(iso: string): string {
    return new Date(iso).toLocaleString(this.language.intlLocale());
  }
}
