import { Component, computed, inject, input } from '@angular/core';

import { LanguageService } from '../i18n/language.service';
import { translateOr } from '../i18n/translate-or';

type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/** Tono por estado, según la tabla de estados de HIFI/08 (reglas comunes). */
const TONE_BY_STATUS: Record<string, Tone> = {
  ACTIVE: 'success',
  APPROVED: 'success',
  ACCEPTED: 'success',
  RESOLVED: 'success',
  READ: 'success',
  PENDING: 'warning',
  PENDING_REVIEW: 'warning',
  SUSPENDED: 'warning',
  MEDIUM: 'warning',
  REJECTED: 'error',
  LOCKED: 'error',
  FAILED: 'error',
  HIGH: 'error',
  OPEN: 'info',
  INVITED: 'info',
  SENT: 'info',
  INACTIVE: 'neutral',
  CLOSED: 'neutral',
  CANCELLED: 'neutral',
  LOW: 'neutral',
};

/** Respaldo en español; la etiqueta visible sale de `status.<ESTADO>` en el idioma activo. */
const LABEL_BY_STATUS: Record<string, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  SUSPENDED: 'Suspendido',
  LOCKED: 'Bloqueado',
  INVITED: 'Invitado',
  OPEN: 'Abierta',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  RESOLVED: 'Resuelta',
  CLOSED: 'Cerrada',
  ACCEPTED: 'Aceptado',
  PENDING: 'Pendiente',
  READ: 'Leída',
  SENT: 'Enviada',
};

/** Píldora de color que representa un estado de dominio (RN de presentación). */
@Component({
  selector: 'app-status-chip',
  standalone: true,
  template: `<span class="nx-chip nx-chip--{{ tone() }}">{{ label() }}</span>`,
})
export class StatusChipComponent {
  readonly status = input.required<string>();
  private readonly language = inject(LanguageService);

  protected readonly tone = computed<Tone>(() => TONE_BY_STATUS[this.status()?.toUpperCase()] ?? 'neutral');
  protected readonly label = computed(() => {
    this.language.lang(); // re-etiqueta al cambiar de idioma
    const raw = this.status() ?? '';
    const code = raw.toUpperCase();
    return translateOr(`status.${code}`, LABEL_BY_STATUS[code] ?? raw);
  });
}
