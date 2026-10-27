import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Estado vacío (DS/09 n.º 18) para vacío, sin resultados y error al cargar (HIFI/05): ícono, título
 * en heading-3, descripción opcional y la acción proyectada (Reintentar, Limpiar filtros…).
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [MatIconModule, TranslocoPipe],
  template: `
    <div class="nx-vacio" [class.nx-vacio--pagina]="page()" [attr.role]="tone() === 'error' ? 'alert' : null">
      <mat-icon class="nx-vacio__icono" [class.is-error]="tone() === 'error'">{{ tone() === 'error' ? 'error_outline' : icon() }}</mat-icon>
      <p class="nx-text-heading-3">{{ message() || ('common.noData' | transloco) }}</p>
      @if (description()) { <p class="nx-vacio__desc">{{ description() }}</p> }
      <ng-content></ng-content>
    </div>
  `,
  styles: [
    `
      p { margin: var(--nx-space-0); }
      .nx-vacio__icono { width: var(--nx-icon-size-xl); height: var(--nx-icon-size-xl); font-size: var(--nx-icon-size-xl); }
    `,
  ],
})
export class EmptyStateComponent {
  readonly icon = input('inbox');
  /** Título ya traducido; vacío muestra el genérico «No hay datos para mostrar». */
  readonly message = input('');
  readonly description = input('');
  /** `error` usa el ícono y el color de error (estado «error al cargar»). */
  readonly tone = input<'empty' | 'error'>('empty');
  /** Sin tarjeta: para el vacío que ocupa toda la página. */
  readonly page = input(false);
}
