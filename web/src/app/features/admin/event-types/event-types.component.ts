import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { ScrollDirective } from '../../../core/ui/scroll.directive';
import { eventLabel } from '../../attendance-events/attendance-events.models';
import { EventTypeSetting, isCore } from './event-type.models';
import { EventTypesService } from './event-types.service';

/**
 * P36 · Tipos de evento por empresa (HU-12 CA1, F19): tabla con el tipo, su etiqueta y el interruptor. ENTRADA/SALIDA son núcleo
 * (siempre activas, no editables); los tipos intermedios pueden habilitarse/deshabilitarse y
 * reetiquetarse. Requiere {@code schedule:manage}.
 */
@Component({
  selector: 'app-event-types',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    PageHeaderComponent,
    TranslocoPipe,
    EmptyStateComponent,
    LoadingBarComponent,
    ScrollDirective,
  ],
  styles: [
    `
      mat-form-field { width: 100%; min-width: calc(var(--nx-space-16) * 3); }
      td { vertical-align: middle; }
      .nx-encabezado__acciones .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
    `,
  ],
  template: `
    <app-loading-bar [active]="loading()" />
    <app-page-header [title]="'layout.nav.eventTypes' | transloco">
      <button mat-flat-button type="button" [disabled]="saving() || loading()" [attr.aria-busy]="saving()" (click)="save()">
        @if (saving()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>save</mat-icon> }
        {{ 'common.save' | transloco }}
      </button>
    </app-page-header>

    @if (error()) {
      <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco">
        <button mat-stroked-button type="button" (click)="load()">{{ 'common.retry' | transloco }}</button>
      </app-empty-state>
    } @else if (!loading()) {
      <div class="nx-tabla nx-tabla--editable">
        <div class="nx-tabla__scroll nx-scroll" nxScroll>
          <table>
            <thead>
              <tr>
                <th scope="col">{{ 'eventTypes.type' | transloco }}</th>
                <th scope="col">{{ 'eventTypes.label' | transloco }}</th>
                <th scope="col">{{ 'eventTypes.enabled' | transloco }}</th>
              </tr>
            </thead>
            <tbody>
              @for (item of settings(); track item.eventType) {
                <tr>
                  <td>{{ typeLabel(item.eventType) }}</td>
                  <td>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>{{ 'eventTypes.label' | transloco }}</mat-label>
                      <input matInput [(ngModel)]="item.label" [disabled]="isCore(item.eventType)" />
                    </mat-form-field>
                  </td>
                  <td>
                    <!-- Entrada y Salida van siempre encendidas: sin ellas no hay jornada. -->
                    <mat-slide-toggle [(ngModel)]="item.enabled" [disabled]="isCore(item.eventType)"
                      [attr.aria-label]="('eventTypes.enabled' | transloco) + ': ' + typeLabel(item.eventType)">
                      {{ 'eventTypes.enabled' | transloco }}
                    </mat-slide-toggle>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
})
export class EventTypesComponent {
  private readonly service = inject(EventTypesService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);

  protected readonly settings = signal<EventTypeSetting[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal(false);
  protected readonly isCore = isCore;

  /** Nombre del tipo en el idioma activo (la columna Tipo; la etiqueta es la de la empresa). */
  protected typeLabel(code: string): string {
    return eventLabel(code);
  }

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.list().subscribe({
      next: (items) => {
        // Copia mutable para el ngModel (evita mutar el objeto de la respuesta directamente).
        this.settings.set(items.map((i) => ({ ...i })));
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  save(): void {
    this.saving.set(true);
    this.service.update(this.settings()).subscribe({
      next: (items) => {
        this.settings.set(items.map((i) => ({ ...i })));
        this.saving.set(false);
        this.notify.success(this.transloco.translate('eventTypes.updated'));
      },
      error: () => {
        this.saving.set(false);
        this.notify.error(this.transloco.translate('common.saveError'));
      },
    });
  }
}
