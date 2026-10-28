import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { TranslocoPipe } from '@jsverse/transloco';

export interface ConfirmData {
  title: string;
  message: string;
  confirmText?: string;
  color?: 'primary' | 'warn';
}

/**
 * Confirmación de acción (S01, DS/10 patrón 7): título con la acción, el mensaje, Cancelar
 * (terciario, foco inicial; Esc equivale a Cancelar) y el botón de confirmar, en tono error para
 * las acciones destructivas (rotar QR, dar de baja, reducir el cupo).
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  styles: [`h2, p { margin: var(--nx-space-0); }`],
  template: `
    <div class="nx-capa__enc"><h2 class="nx-text-heading-3" mat-dialog-title>{{ data.title }}</h2></div>
    <div class="nx-capa__cuerpo"><p>{{ data.message }}</p></div>
    <div class="nx-capa__pie">
      <button mat-button type="button" cdkFocusInitial [mat-dialog-close]="false">
        <mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}
      </button>
      <button mat-flat-button type="button" [color]="data.color ?? 'primary'" [mat-dialog-close]="true">
        {{ data.confirmText ?? ('common.confirm' | transloco) }}
      </button>
    </div>
  `,
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
}
