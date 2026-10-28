import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { ScrollDirective } from '../../core/ui/scroll.directive';
import { AuditEntry } from './audit.models';

/** Claves cuyo valor nunca se muestra en el detalle (RN-60: secretos enmascarados). */
const SECRET_KEY = /pass|secret|token|hash|key|otp|pin/i;
const MASK = '••••••';

/**
 * P18 · Detalle de auditoría (drawer, solo lectura): fecha, actor, acción, recurso, origen (IP,
 * navegador, dispositivo) y los valores antes/después en bloque, con los secretos enmascarados.
 */
@Component({
  selector: 'app-audit-detail-drawer',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, TranslocoPipe, AppDatePipe, ScrollDirective],
  styles: [
    `
      h2, dl, dd, pre { margin: var(--nx-space-0); }
      .nx-dato--bloque { grid-column: 1 / -1; }
    `,
  ],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3">{{ 'audit.detail' | transloco }}</h2>
      <button mat-icon-button type="button" mat-dialog-close [attr.aria-label]="'common.close' | transloco">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <div class="nx-capa__cuerpo nx-scroll" nxScroll>
      <dl class="nx-datos">
        <div class="nx-dato">
          <dt class="nx-text-heading-6">{{ 'audit.date' | transloco }}</dt>
          <dd><span class="nx-text-numeric">{{ e.createdAt | appDate: 'dd/MM/yyyy HH:mm' }}</span></dd>
        </div>
        <div class="nx-dato">
          <dt class="nx-text-heading-6">{{ 'audit.actor' | transloco }}</dt>
          <dd>{{ actor() }}</dd>
        </div>
        <div class="nx-dato">
          <dt class="nx-text-heading-6">{{ 'audit.action' | transloco }}</dt>
          <dd class="nx-text-code">{{ e.action }}</dd>
        </div>
        <div class="nx-dato">
          <dt class="nx-text-heading-6">{{ 'audit.resource' | transloco }}</dt>
          <dd>{{ e.resourceType }}</dd>
        </div>
        <div class="nx-dato">
          <dt class="nx-text-heading-6">{{ 'audit.resourceId' | transloco }}</dt>
          <dd class="nx-text-code">{{ e.resourceId }}</dd>
        </div>
        <div class="nx-dato">
          <dt class="nx-text-heading-6">IP</dt>
          <dd class="nx-text-code">{{ e.ip || '—' }}</dd>
        </div>
        <div class="nx-dato nx-dato--bloque">
          <dt class="nx-text-heading-6">{{ 'audit.browser' | transloco }}</dt>
          <dd class="nx-text-code">{{ e.userAgent || '—' }}</dd>
        </div>
        <div class="nx-dato">
          <dt class="nx-text-heading-6">{{ 'audit.device' | transloco }}</dt>
          <dd class="nx-text-code">{{ e.deviceInfo || '—' }}</dd>
        </div>

      @if (e.oldValues) {
        <div class="nx-dato nx-dato--bloque">
          <dt class="nx-text-heading-6">{{ 'audit.oldValues' | transloco }}</dt>
          <dd><pre class="nx-text-code">{{ pretty(e.oldValues) }}</pre></dd>
        </div>
      }
      @if (e.newValues) {
        <div class="nx-dato nx-dato--bloque">
          <dt class="nx-text-heading-6">{{ 'audit.newValues' | transloco }}</dt>
          <dd><pre class="nx-text-code">{{ pretty(e.newValues) }}</pre></dd>
        </div>
      }
      </dl>
    </div>

    <div class="nx-capa__pie">
      <button mat-button type="button" mat-dialog-close>{{ 'common.close' | transloco }}</button>
    </div>
  `,
})
export class AuditDetailDrawerComponent {
  protected readonly e = inject<AuditEntry>(MAT_DIALOG_DATA);
  private readonly transloco = inject(TranslocoService);

  /** El correo identifica al autor mejor que su id; sin autor, la acción fue del sistema. */
  protected actor(): string {
    return this.e.actorEmail || this.e.actorUserId || this.transloco.translate('audit.system');
  }

  /** Los valores llegan como JSON en una línea: se indentan y se enmascaran los secretos. */
  protected pretty(json: string): string {
    try {
      return JSON.stringify(JSON.parse(json), (key, value) => (key && SECRET_KEY.test(key) ? MASK : value), 2);
    } catch {
      return json;
    }
  }
}
