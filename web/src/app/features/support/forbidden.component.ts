import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { EmptyStateComponent } from '../../core/ui/empty-state.component';

/** S02 · Acceso denegado: destino de las rutas cuyo permiso no tiene el usuario. */
@Component({
  selector: 'app-forbidden',
  standalone: true,
  imports: [EmptyStateComponent, MatButtonModule, RouterLink, TranslocoPipe],
  template: `
    <app-empty-state icon="lock" [page]="true" [message]="'support.forbidden.title' | transloco">
      <a mat-flat-button routerLink="/dashboard">{{ 'support.forbidden.action' | transloco }}</a>
    </app-empty-state>
  `,
})
export class ForbiddenComponent {}
