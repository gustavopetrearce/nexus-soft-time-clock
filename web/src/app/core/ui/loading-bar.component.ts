import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Carga de datos (DS/09 n.º 19, HIFI/08 C3): barra de `space-1` sobre el contenido. Reserva su alto
 * aunque no esté cargando, para que el layout no se mueva. Sin skeletons.
 */
@Component({
  selector: 'app-loading-bar',
  standalone: true,
  imports: [TranslocoPipe],
  template: `
    @if (active()) {
      <div class="nx-carga--barra" role="progressbar" [attr.aria-label]="'common.loading' | transloco"></div>
    }
  `,
  styles: [`:host { display: block; height: var(--nx-space-1); }`],
})
export class LoadingBarComponent {
  readonly active = input(false);
}
