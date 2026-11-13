import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { AppNumberPipe } from '../../core/i18n/app-number.pipe';
import { AuthStore } from '../../core/auth/auth.store';
import { AlertComponent } from '../../core/ui/alert.component';
import { LoadingBarComponent } from '../../core/ui/loading-bar.component';
import { NotificationService } from '../../core/ui/notification.service';
import { localizedProblem } from '../../core/ui/problem-detail';
import { ScrollDirective } from '../../core/ui/scroll.directive';
import {
  AttendanceEvent,
  CANCEL_REASON_MAX,
  CANCELLABLE_STATUSES,
  eventWithBreakLabel,
  recordStatusLabel,
  rejectionLabel,
} from './attendance-events.models';
import { AttendanceEventsService } from './attendance-events.service';

/**
 * P41 · Detalle del registro (RF-18, HU-13): datos de la marcación y su evidencia fotográfica.
 * La imagen sale de una URL prefirmada de vida corta que se pide al abrir el diálogo: incluirla en
 * el listado no serviría porque caducaría antes de que nadie la use.
 *
 * Con `attendance:cancel`, una marca aceptada o en revisión se puede cancelar desde aquí con una
 * causa en texto libre (definitivo). El diálogo se cierra devolviendo la marca actualizada.
 */
@Component({
  selector: 'app-attendance-detail-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule, TranslocoPipe, AppDatePipe, AppNumberPipe, AlertComponent, LoadingBarComponent, ScrollDirective],
  styles: [
    `
      :host { display: flex; flex-direction: column; max-height: inherit; }
      h2, h3, dl, dd, p { margin: var(--nx-space-0); }
      .nx-foto img { display: block; width: 100%; height: auto; }
      .nx-foto:has(img) { min-height: var(--nx-space-0); }
      .nx-cancelar { display: flex; flex-direction: column; gap: var(--nx-space-3); }
      .nx-cancelar mat-form-field { width: 100%; }
    `,
  ],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3" id="detalle-registro">{{ eventWithBreakLabel(data.eventType, data.breakType) }}</h2>
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
            @if (data.cancelReason) { · {{ data.cancelReason }} }
          </dd>
        </div>
        @if (data.cancelledAt) {
          <div class="nx-dato">
            <dt class="nx-text-heading-6">{{ 'attendanceEvents.cancel.cancelledAt' | transloco }}</dt>
            <dd><span class="nx-text-numeric">{{ data.cancelledAt | appDate: 'dd/MM/yyyy HH:mm' }}</span></dd>
          </div>
        }
        @if (data.cancelledByName) {
          <div class="nx-dato">
            <dt class="nx-text-heading-6">{{ 'attendanceEvents.cancel.cancelledBy' | transloco }}</dt>
            <dd>{{ data.cancelledByName }}</dd>
          </div>
        }
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
            <dd>{{ sourceKey(data.source) | transloco }}</dd>
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

    @if (cancelling()) {
      <form class="nx-capa__cuerpo nx-cancelar" id="cancelar-marcacion" (ngSubmit)="confirmCancel()">
        <h3 class="nx-text-heading-4">{{ 'attendanceEvents.cancel.title' | transloco }}</h3>
        <app-alert tone="warning">{{ 'attendanceEvents.cancel.warning' | transloco }}</app-alert>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'attendanceEvents.cancel.reason' | transloco }}</mat-label>
          <textarea matInput [formControl]="reason" rows="3" required [maxlength]="reasonMax"
            [placeholder]="'attendanceEvents.cancel.reasonPlaceholder' | transloco"></textarea>
          <mat-hint align="end" class="nx-text-numeric">{{ reasonLength() }}/{{ reasonMax }}</mat-hint>
          @if (reason.touched && reason.invalid) {
            <mat-error>{{ 'attendanceEvents.cancel.reasonRequired' | transloco }}</mat-error>
          }
        </mat-form-field>
      </form>
    }

    <div class="nx-capa__pie">
      @if (cancelling()) {
        <button mat-button type="button" (click)="cancelling.set(false)" [disabled]="saving()">
          {{ 'attendanceEvents.cancel.back' | transloco }}
        </button>
        <button mat-flat-button color="warn" type="submit" form="cancelar-marcacion" [disabled]="saving()">
          {{ 'attendanceEvents.cancel.confirm' | transloco }}
        </button>
      } @else {
        @if (canCancel) {
          <button mat-button color="warn" type="button" (click)="cancelling.set(true)">
            {{ 'attendanceEvents.cancel.action' | transloco }}
          </button>
        }
        <button mat-button type="button" mat-dialog-close cdkFocusInitial>{{ 'common.close' | transloco }}</button>
      }
    </div>
  `,
})
export class AttendanceDetailDialogComponent {
  protected readonly data = inject<AttendanceEvent>(MAT_DIALOG_DATA);
  private readonly service = inject(AttendanceEventsService);
  private readonly ref = inject<MatDialogRef<AttendanceDetailDialogComponent, AttendanceEvent>>(MatDialogRef);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);

  protected readonly canCancel =
    inject(AuthStore).hasPermission('attendance:cancel') && CANCELLABLE_STATUSES.includes(this.data.status);
  protected readonly cancelling = signal(false);
  protected readonly saving = signal(false);
  protected readonly reasonMax = CANCEL_REASON_MAX;
  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(CANCEL_REASON_MAX)],
  });
  private readonly reasonValue = toSignal(this.reason.valueChanges, { initialValue: '' });
  protected readonly reasonLength = computed(() => this.reasonValue().length);

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

  protected confirmCancel(): void {
    if (this.reason.invalid) {
      this.reason.markAsTouched();
      return;
    }
    this.saving.set(true);
    this.service.cancel(this.data.recordId, this.data.serverTime, this.reason.value.trim()).subscribe({
      next: (r) => {
        this.saving.set(false);
        this.notify.success(this.transloco.translate('attendanceEvents.cancel.done'));
        // El nombre de quien canceló llega al recargar el listado; aquí basta con la causa y la hora.
        this.ref.close({ ...this.data, status: r.status, cancelReason: r.cancelReason, cancelledAt: r.cancelledAt });
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.notify.error(localizedProblem(this.transloco, err, 'attendanceEvents.cancel.error'));
      },
    });
  }

  protected sourceKey(source: string): string {
    if (source === 'OFFLINE_SYNC') return 'attendanceEvents.detail.offline';
    return source === 'EXTERNAL' ? 'attendanceEvents.detail.external' : 'attendanceEvents.detail.online';
  }

  protected eventWithBreakLabel(code: string, breakType?: string | null): string {
    return eventWithBreakLabel(code, breakType);
  }

  protected statusLabel(code: string): string {
    return recordStatusLabel(code);
  }

  protected rejectionLabel(code: string): string {
    return rejectionLabel(code);
  }
}
