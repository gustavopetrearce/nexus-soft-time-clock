import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
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
  imports: [MatDialogModule, MatButtonModule, TranslocoPipe],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button cdkFocusInitial [mat-dialog-close]="false">{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button [color]="data.color ?? 'primary'" [mat-dialog-close]="true">
        {{ data.confirmText ?? ('common.confirm' | transloco) }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
}
