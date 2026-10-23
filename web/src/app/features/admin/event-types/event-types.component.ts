import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { NotificationService } from '../../../core/ui/notification.service';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { EventTypeSetting, isCore } from './event-type.models';
import { EventTypesService } from './event-types.service';

/**
 * Configuración por empresa de los tipos de evento (HU-12 CA1). ENTRADA/SALIDA son núcleo
 * (siempre activas, no editables); los tipos intermedios pueden habilitarse/deshabilitarse y
 * reetiquetarse. Requiere {@code schedule:manage}.
 */
@Component({
  selector: 'app-event-types',
  standalone: true,
  imports: [
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    PageHeaderComponent,
    TranslocoPipe,
  ],
  template: `
    <app-page-header [title]="'layout.nav.eventTypes' | transloco" [subtitle]="'eventTypes.subtitle' | transloco" />
    @if (error()) { <p class="error-text">{{ error() }}</p> }

    <mat-card style="max-width:640px">
      <mat-card-content>
        @if (loading()) {
          <p>{{ 'common.loading' | transloco }}</p>
        } @else {
          @for (item of settings(); track item.eventType) {
            <div class="row">
              <div class="info">
                <span class="code">{{ item.eventType }}</span>
                @if (isCore(item.eventType)) {
                  <span class="core-tag">{{ 'eventTypes.core' | transloco }}</span>
                }
              </div>

              <mat-form-field appearance="outline" class="label-field">
                <mat-label>{{ 'eventTypes.label' | transloco }}</mat-label>
                <input matInput [(ngModel)]="item.label" [disabled]="isCore(item.eventType)" />
              </mat-form-field>

              <mat-slide-toggle
                [(ngModel)]="item.enabled"
                [disabled]="isCore(item.eventType)"
                color="primary"
              >
                {{ (item.enabled ? 'eventTypes.enabled' : 'eventTypes.disabled') | transloco }}
              </mat-slide-toggle>
            </div>
          }

          <div class="actions">
            <button mat-flat-button color="primary" [disabled]="saving()" (click)="save()">
              <mat-icon>save</mat-icon> {{ 'common.save' | transloco }}
            </button>
            <button mat-button type="button" [disabled]="saving()" (click)="load()">{{ 'common.discard' | transloco }}</button>
          </div>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      .row {
        display: flex;
        align-items: center;
        gap: var(--sp-4);
        padding: var(--sp-3) 0;
        border-bottom: 1px solid var(--border);
      }
      .row:last-of-type { border-bottom: none; }
      .info {
        width: 160px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .code {
        font-weight: 650;
        font-size: var(--font-body);
      }
      .core-tag {
        font-size: var(--font-caption);
        font-weight: 700;
        color: var(--brand);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .label-field {
        flex: 1 1 auto;
      }
      .actions {
        margin-top: var(--sp-4);
        display: flex;
        gap: var(--sp-2);
      }
    `,
  ],
})
export class EventTypesComponent {
  private readonly service = inject(EventTypesService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);

  protected readonly settings = signal<EventTypeSetting[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly isCore = isCore;

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.list().subscribe({
      next: (items) => {
        // Copia mutable para el ngModel (evita mutar el objeto de la respuesta directamente).
        this.settings.set(items.map((i) => ({ ...i })));
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.transloco.translate('eventTypes.loadError'));
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
