import { Component, Input } from '@angular/core';

/** Encabezado de página (DS/09 n.º 23): título y descripción opcional; acciones proyectadas a la derecha. */
@Component({
  selector: 'app-page-header',
  standalone: true,
  template: `
    <header class="nx-encabezado">
      <div class="nx-encabezado__texto">
        <h1 class="nx-text-heading-1">{{ title }}</h1>
        @if (subtitle) { <p class="nx-encabezado__desc">{{ subtitle }}</p> }
      </div>
      <div class="nx-encabezado__acciones"><ng-content></ng-content></div>
    </header>
  `,
  styles: [
    `
      :host { display: block; margin-bottom: var(--nx-space-gap-section); }
      h1, p { margin: var(--nx-space-0); }
      .nx-encabezado__acciones:empty { display: none; }
    `,
  ],
})
export class PageHeaderComponent {
  @Input({ required: true }) title = '';
  @Input() subtitle?: string;
}
