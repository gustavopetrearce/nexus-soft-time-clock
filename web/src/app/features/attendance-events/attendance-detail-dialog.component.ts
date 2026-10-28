import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoPipe } from '@jsverse/transloco';

import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { AppNumberPipe } from '../../core/i18n/app-number.pipe';
import { AlertComponent } from '../../core/ui/alert.component';
import { LoadingBarComponent } from '../../core/ui/loading-bar.component';
import { ScrollDirective } from '../../core/ui/scroll.directive';
import { AttendanceEvent, eventLabel, recordStatusLabel, rejectionLabel } from './attendance-events.models';
import { AttendanceEventsService } from './attendance-events.service';

/**
 * P41 · Detalle del registro (RF-18, HU-13): datos de la marcación y su evidencia fotográfica.
 * La imagen sale de una URL prefirmada de vida corta que se pide al abrir el diálogo: incluirla en
 * el listado no serviría porque caducaría antes de que nadie la use.
 */
@Component({
  selector: 'app-attendance-detail-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, TranslocoPipe, AppDatePipe, AppNumberPipe, AlertComponent, LoadingBarComponent, ScrollDirective],
  styles: [
    `
      :host { display: flex; flex-direction: column; max-height: inherit; }
      h2, h3, dl, dd, p { margin: var(--nx-space-0); }
      .nx-foto img { display: block; width: 100%; height: auto; }
      .nx-foto:has(img) { min-height: var(--nx-space-0); }
    `,
  ],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3" id="detalle-registro">{{ eventLabel(data.eventType) }}</h2>
    </div>

    <div class="nx-capa__cuerpo nx-scroll" nxScroll>
      <dl class="nx-datos">
        <div class="nx-dato">
          <dt class="nx-text-heading-6">{{ 'attendanceEvents.col.collaborator' | transloco }}</dt>
          <dd>{{ data.employeeName || '—' }}</dd>
        </div>
        <div class="nx-dato">
          <dt class="nx-text-heading-6">{{ 'attendanceEvents.detail.employeeNo' | transloco }}</dt>
          <dd class="nx-text-code">{{ data.employeeCode || '—' }}</dd>
        </div>
        <div class="nx-dato">
          <dt class="nx-text-heading-6">{{ 'attendanceEvents.detail.site' | transloco }}</dt>
          <dd>
            @if (data.siteless) {
              {{ 'attendanceEvents.siteless' | transloco }} · {{ 'attendanceEvents.detail.noGeofence' | transloco }}
            } @else {
              {{ data.workSite || '—' }}
            }
          </dd>
        </div>
        <div class="nx-dato">
          <dt class="nx-text-heading-6">{{ 'attendanceEvents.col.date' | transloco }}</dt>
          <dd><span class="nx-text-numeric">{{ data.serverTime | appDate: 'dd/MM/yyyy HH:mm:ss' }}</span></dd>
        </div>
        <div class="nx-dato">
          <dt class="nx-text-heading-6">{{ 'common.status' | transloco }}</dt>
          <dd>
            {{ statusLabel(data.status) }}
            @if (data.rejectionReason) { · {{ rejectionLabel(data.rejectionReason) }} }
          </dd>
        </div>
        @if (data.gpsAccuracyM != null) {
          <div class="nx-dato">
            <dt class="nx-text-heading-6">{{ 'workSites.form.gpsAccuracy' | transloco }}</dt>
            <dd>±<span class="nx-text-numeric">{{ data.gpsAccuracyM | appNumber }}</span> m</dd>
          </div>
        }
        @if (data.distanceToSiteM != null) {
          <div class="nx-dato">
            <dt class="nx-text-heading-6">{{ 'attendanceEvents.detail.distance' | transloco }}</dt>
            <dd><span class="nx-text-numeric">{{ data.distanceToSiteM | appNumber }}</span> m</dd>
          </div>
        }
        <div class="nx-dato">
          <dt class="nx-text-heading-6">{{ 'workSites.form.biometrics' | transloco }}</dt>
          <dd>{{ (data.biometricVerified ? 'attendanceEvents.detail.verified' : 'attendanceEvents.detail.notVerified') | transloco }}</dd>
        </div>
        @if (data.source) {
          <div class="nx-dato">
            <dt class="nx-text-heading-6">{{ 'attendanceEvents.detail.source' | transloco }}</dt>
            <dd>{{ (data.source === 'OFFLINE_SYNC' ? 'attendanceEvents.detail.offline' : 'attendanceEvents.detail.online') | transloco }}</dd>
          </div>
        }
      </dl>

      <h3 class="nx-text-heading-4">{{ 'attendanceEvents.detail.evidence' | transloco }}</h3>
      @if (!data.hasEvidence) {
        <p class="nx-text-small nx-sec">{{ 'attendanceEvents.detail.noPhoto' | transloco }}</p>
      } @else if (error()) {
        <app-alert tone="error">{{ 'attendanceEvents.detail.evidenceError' | transloco }}</app-alert>
      } @else {
        <app-loading-bar [active]="loading()" />
        @if (url(); as src) {
          <div class="nx-foto"><img [src]="src" [alt]="'attendanceEvents.detail.evidenceAlt' | transloco" /></div>
        }
      }
    </div>

    <div class="nx-capa__pie">
      <button mat-button type="button" mat-dialog-close cdkFocusInitial>{{ 'common.close' | transloco }}</button>
    </div>
  `,
})
export class AttendanceDetailDialogComponent {
  protected readonly data = inject<AttendanceEvent>(MAT_DIALOG_DATA);
  private readonly service = inject(AttendanceEventsService);

  protected readonly url = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);

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
        this.error.set(true);
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
}
