import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

/** Estado vacío para tablas/listas sin resultados. */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [MatIconModule, TranslocoPipe],
  template: `
    <div class="empty">
      <mat-icon>{{ icon() }}</mat-icon>
      <p>{{ message() || ('common.noData' | transloco) }}</p>
    </div>
  `,
  styles: [
    `
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 40px 16px;
        color: var(--text-muted);
        text-align: center;
      }
      .empty mat-icon {
        font-size: 40px;
        width: 40px;
        height: 40px;
        opacity: 0.5;
      }
      .empty p { margin: 0; }
    `,
  ],
})
export class EmptyStateComponent {
  readonly icon = input('inbox');
  /** Texto ya traducido; vacío muestra el genérico «No hay datos para mostrar». */
  readonly message = input('');
}
