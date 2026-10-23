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
    <nav class="breadcrumb" [attr.aria-label]="'common.breadcrumb' | transloco">
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
      .breadcrumb {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: var(--font-small);
        color: var(--text-muted);
        margin-bottom: var(--sp-2);
      }
      .breadcrumb a { color: var(--text-muted); text-decoration: none; }
      .breadcrumb a:hover { color: var(--brand); text-decoration: underline; }
      .breadcrumb .current { color: var(--text); font-weight: 600; }
      .breadcrumb mat-icon { font-size: 16px; width: 16px; height: 16px; color: var(--text-soft); }
    `,
  ],
})
export class BreadcrumbComponent {
  readonly items = input.required<BreadcrumbItem[]>();
}
