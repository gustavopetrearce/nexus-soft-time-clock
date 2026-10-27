import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

export interface BreadcrumbItem {
  label: string;
  route?: string;
}

/** Ruta de navegación ("Organización > Usuarios > Nuevo usuario") para pantallas de formulario. */
@Component({
  selector: 'app-breadcrumb',
  standalone: true,
  imports: [RouterLink, MatIconModule, TranslocoPipe],
  template: `
    <nav class="nx-breadcrumb breadcrumb" [attr.aria-label]="'common.breadcrumb' | transloco">
      @for (item of items(); track item.label; let last = $last) {
        @if (item.route && !last) {
          <a [routerLink]="item.route">{{ item.label }}</a>
        } @else {
          <span [class.current]="last">{{ item.label }}</span>
        }
        @if (!last) {
          <mat-icon>chevron_right</mat-icon>
        }
      }
    </nav>
  `,
  styles: [
    `
      .breadcrumb { margin-bottom: var(--nx-space-2); }
      .breadcrumb a { color: var(--nx-color-text-secondary); text-decoration: none; }
      .breadcrumb a:hover { color: var(--nx-color-action-primary); text-decoration: underline; }
      .breadcrumb .current { color: var(--nx-color-text-primary); font-weight: var(--nx-font-weight-semibold); }
      .breadcrumb mat-icon { font-size: var(--nx-icon-size-sm); width: var(--nx-icon-size-sm); height: var(--nx-icon-size-sm); color: var(--nx-color-text-disabled); }
    `,
  ],
})
export class BreadcrumbComponent {
  readonly items = input.required<BreadcrumbItem[]>();
}
