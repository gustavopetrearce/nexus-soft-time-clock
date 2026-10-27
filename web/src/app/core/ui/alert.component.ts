import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

type AlertTone = 'info' | 'success' | 'warning' | 'error';

const ICON: Record<AlertTone, string> = {
  info: 'info',
  success: 'check_circle',
  warning: 'warning_amber',
  error: 'error_outline',
};

/**
 * Aviso (DS/09 n.º 16): mensaje en línea con tono de estado; el contenido va proyectado y las
 * acciones en `[actions]`. `banner` lo pega al borde (sin radio, solo borde inferior).
 */
@Component({
  selector: 'app-alert',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="nx-aviso nx-aviso--{{ tone() }}" [class.nx-aviso--banner]="banner()" [attr.role]="role()">
      <mat-icon>{{ icon() }}</mat-icon>
      <div class="nx-aviso__cuerpo"><ng-content></ng-content></div>
      <div class="nx-aviso__acciones"><ng-content select="[actions]"></ng-content></div>
    </div>
  `,
  styles: [`.nx-aviso__acciones:empty { display: none; }`],
})
export class AlertComponent {
  readonly tone = input<AlertTone>('info');
  readonly banner = input(false);
  protected readonly icon = computed(() => ICON[this.tone()]);
  /** Los errores y advertencias se anuncian al lector de pantalla. */
  protected readonly role = computed(() => (this.tone() === 'error' || this.tone() === 'warning' ? 'alert' : 'status'));
}
