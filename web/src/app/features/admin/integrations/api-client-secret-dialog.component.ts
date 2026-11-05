import { Clipboard } from '@angular/cdk/clipboard';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AlertComponent } from '../../../core/ui/alert.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { ApiClientCredentials, basicAuthorization } from './api-client.models';

export interface ApiClientSecretDialogData {
  credentials: ApiClientCredentials;
  /** Viene de rotar: el secreto anterior ya dejó de valer. */
  rotated: boolean;
}

/**
 * Muestra el secreto recién generado. Es la única vez que se puede ver, así que el diálogo no se
 * cierra con Esc ni pulsando fuera (se abre con `disableClose`): hay que confirmarlo con el botón.
 *
 * Copia con el Clipboard de CDK y no con `navigator.clipboard`, que no existe fuera de HTTPS. Los
 * valores quedan además a la vista y seleccionables por si el navegador bloquea la copia.
 */
@Component({
  selector: 'app-api-client-secret-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe, AlertComponent],
  styles: [
    `
      h2, pre { margin: var(--nx-space-0); }
      .valor { display: grid; gap: var(--nx-space-1); margin-top: var(--nx-space-gap-related); }
      .valor__fila { display: flex; align-items: flex-start; gap: var(--nx-space-2); }
      .valor__fila pre { flex: 1; min-width: 0; }
    `,
  ],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3" mat-dialog-title>
        {{ (data.rotated ? 'apiClients.secret.titleRotated' : 'apiClients.secret.title') | transloco: { name: data.credentials.name } }}
      </h2>
    </div>
    <div class="nx-capa__cuerpo">
      <app-alert tone="warning">
        {{ (data.rotated ? 'apiClients.secret.warningRotated' : 'apiClients.secret.warning') | transloco }}
      </app-alert>

      @for (field of fields; track field.key) {
        <div class="valor">
          <span class="nx-campo__label">{{ field.key | transloco }}</span>
          <div class="valor__fila">
            <pre class="nx-text-code">{{ field.value }}</pre>
            <button mat-icon-button type="button" [attr.aria-label]="'apiClients.secret.copy' | transloco: { field: (field.key | transloco) }" (click)="copy(field.value)">
              <mat-icon>content_copy</mat-icon>
            </button>
          </div>
        </div>
      }
      <p class="nx-campo__ayuda nx-text-small nx-sec">{{ 'apiClients.secret.headerHint' | transloco }}</p>
    </div>
    <div class="nx-capa__pie">
      <button mat-flat-button type="button" mat-dialog-close><mat-icon>check</mat-icon>{{ 'apiClients.secret.done' | transloco }}</button>
    </div>
  `,
})
export class ApiClientSecretDialogComponent {
  private readonly clipboard = inject(Clipboard);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  protected readonly data = inject<ApiClientSecretDialogData>(MAT_DIALOG_DATA);

  protected readonly fields = [
    { key: 'apiClients.secret.clientId', value: this.data.credentials.clientId },
    { key: 'apiClients.secret.clientSecret', value: this.data.credentials.clientSecret },
    { key: 'apiClients.secret.header', value: `Authorization: ${basicAuthorization(this.data.credentials)}` },
  ];

  protected copy(value: string): void {
    if (this.clipboard.copy(value)) {
      this.notify.success(this.transloco.translate('apiClients.secret.copied'));
    } else {
      this.notify.error(this.transloco.translate('apiClients.secret.copyError'));
    }
  }
}
