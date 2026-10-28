import { NgTemplateOutlet } from '@angular/common';
import { Component, TemplateRef, inject, input, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Botón «Filtros» de los listados (HIFI/08, patrón E1): por debajo de breakpoint-md los filtros
 * secundarios (`.nx-flt-sec`) se ocultan y este botón los abre en un diálogo. Recibe la misma
 * plantilla que se pinta en línea, así ambos comparten los controles del formulario.
 */
@Component({
  selector: 'app-filters-button',
  standalone: true,
  imports: [NgTemplateOutlet, MatButtonModule, MatDialogModule, MatIconModule, TranslocoPipe],
  host: { class: 'nx-flt-btn' },
  template: `
    <button mat-button type="button" (click)="open()"><mat-icon>filter_list</mat-icon>{{ 'common.filters' | transloco }}</button>
    <ng-template #dialogo>
      <h2 mat-dialog-title>{{ 'common.filters' | transloco }}</h2>
      <mat-dialog-content class="nx-filtros-dialogo">
        <ng-container [ngTemplateOutlet]="filters()" />
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-flat-button type="button" mat-dialog-close>{{ 'common.close' | transloco }}</button>
      </mat-dialog-actions>
    </ng-template>
  `,
  styles: [
    `
      :host { flex: none; }
      ::ng-deep .nx-filtros-dialogo { display: flex; flex-direction: column; gap: var(--nx-space-gap-related); }
      ::ng-deep .nx-filtros-dialogo mat-form-field { width: 100%; }
    `,
  ],
})
export class FiltersButtonComponent {
  private readonly dialog = inject(MatDialog);
  readonly filters = input.required<TemplateRef<unknown>>();
  private readonly dialogo = viewChild.required<TemplateRef<unknown>>('dialogo');

  protected open(): void {
    this.dialog.open(this.dialogo(), { width: '100%', maxWidth: 'var(--nx-layout-dialog-max)' });
  }
}
