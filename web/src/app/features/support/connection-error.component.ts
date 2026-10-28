import { Component, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoPipe } from '@jsverse/transloco';

import { EmptyStateComponent } from '../../core/ui/empty-state.component';

/** S03 · Error de conexión: «Reintentar» vuelve a montar la misma pantalla. */
@Component({
  selector: 'app-connection-error',
  standalone: true,
  imports: [EmptyStateComponent, MatButtonModule, TranslocoPipe],
  template: `
    <app-empty-state
      icon="cloud_off"
      [page]="true"
      [message]="'support.connection.title' | transloco"
      [description]="'support.connection.description' | transloco"
    >
      <button mat-flat-button type="button" (click)="retry.emit()">{{ 'common.retry' | transloco }}</button>
    </app-empty-state>
  `,
})
export class ConnectionErrorComponent {
  readonly retry = output<void>();
}
