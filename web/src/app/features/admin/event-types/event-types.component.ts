import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { concat, forkJoin, Observable } from 'rxjs';
import { map, toArray } from 'rxjs/operators';

import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { ScrollDirective } from '../../../core/ui/scroll.directive';
import { eventLabel } from '../../attendance-events/attendance-events.models';
import { BreakType, codeFromLabel, EventTypeSetting, isCore } from './event-type.models';
import { BreakTypesService } from './break-types.service';
import { EventTypesService } from './event-types.service';

const CODE_PATTERN = /^[A-Z0-9_]{1,30}$/;

/**
 * P36 · Tipos de evento por empresa (HU-12 CA1, F19): tabla con el tipo, su etiqueta y el interruptor. ENTRADA/SALIDA son núcleo
 * (siempre activas, no editables); los tipos intermedios pueden habilitarse/deshabilitarse y
 * reetiquetarse. Debajo, las categorías de descanso (V30): almuerzo, comida, café… que el
 * colaborador elige al iniciar un descanso. No son tipos de evento nuevos: califican el par
 * inicio/fin de descanso, así que la secuencia de la jornada no cambia. Requiere {@code schedule:manage}.
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
      .nx-num { min-width: calc(var(--nx-space-16) * 2); }
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

      <section class="nx-panel" aria-labelledby="tipos-descanso">
        <div class="nx-panel__barra">
          <div>
            <h2 class="nx-text-heading-4" id="tipos-descanso">{{ 'breakTypes.title' | transloco }}</h2>
            <p class="nx-text-small nx-sec">{{ 'breakTypes.subtitle' | transloco }}</p>
          </div>
          <div class="nx-panel__acciones">
            <button mat-stroked-button type="button" [disabled]="saving() || !breaksEnabled()" (click)="addBreakType()">
              <mat-icon>add</mat-icon>
              {{ 'breakTypes.add' | transloco }}
            </button>
          </div>
        </div>

        @if (!breaksEnabled()) {
          <p class="nx-text-small nx-sec">{{ 'breakTypes.breaksDisabled' | transloco }}</p>
        } @else if (breakTypes().length === 0) {
          <app-empty-state icon="free_breakfast" [message]="'breakTypes.empty' | transloco"
            [description]="'breakTypes.emptyHint' | transloco" />
        } @else {
          <div class="nx-tabla nx-tabla--editable">
            <div class="nx-tabla__scroll nx-scroll" nxScroll>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{{ 'eventTypes.label' | transloco }}</th>
                    <th scope="col">{{ 'breakTypes.code' | transloco }}</th>
                    <th scope="col">{{ 'breakTypes.maxMinutes' | transloco }}</th>
                    <th scope="col">{{ 'breakTypes.paid' | transloco }}</th>
                    <th scope="col">{{ 'eventTypes.enabled' | transloco }}</th>
                    <th scope="col"><span class="nx-sr-only">{{ 'common.actions' | transloco }}</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of breakTypes(); track row; let i = $index) {
                    <tr>
                      <td>
                        <mat-form-field appearance="outline" subscriptSizing="dynamic">
                          <mat-label>{{ 'eventTypes.label' | transloco }}</mat-label>
                          <input matInput maxlength="60" required [(ngModel)]="row.label"
                            (ngModelChange)="onLabelChange(row)" />
                        </mat-form-field>
                      </td>
                      <td>
                        <mat-form-field appearance="outline" subscriptSizing="dynamic">
                          <mat-label>{{ 'breakTypes.code' | transloco }}</mat-label>
                          <input matInput maxlength="30" required [(ngModel)]="row.code"
                            (ngModelChange)="onCodeChange(row)" />
                        </mat-form-field>
                      </td>
                      <td>
                        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nx-num">
                          <mat-label>{{ 'breakTypes.maxMinutes' | transloco }}</mat-label>
                          <input matInput type="number" min="1" [(ngModel)]="row.maxMinutes" />
                        </mat-form-field>
                      </td>
                      <td>
                        <mat-slide-toggle [(ngModel)]="row.paid"
                          [attr.aria-label]="('breakTypes.paid' | transloco) + ': ' + row.label">
                          {{ 'breakTypes.paid' | transloco }}
                        </mat-slide-toggle>
                      </td>
                      <td>
                        <mat-slide-toggle [(ngModel)]="row.enabled"
                          [attr.aria-label]="('eventTypes.enabled' | transloco) + ': ' + row.label">
                          {{ 'eventTypes.enabled' | transloco }}
                        </mat-slide-toggle>
                      </td>
                      <td>
                        <button mat-icon-button type="button" [disabled]="saving()" (click)="removeBreakType(i)"
                          [attr.aria-label]="('common.remove' | transloco) + ': ' + row.label">
                          <mat-icon>delete</mat-icon>
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      </section>
    }
  `,
})
export class EventTypesComponent {
  private readonly service = inject(EventTypesService);
  private readonly breakService = inject(BreakTypesService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);

  protected readonly settings = signal<EventTypeSetting[]>([]);
  protected readonly breakTypes = signal<BreakType[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal(false);
  protected readonly isCore = isCore;

  /** Categorías borradas en pantalla, pendientes de eliminar al guardar. */
  private removedIds: string[] = [];
  /** Filas nuevas cuyo código escribió el usuario: deja de sugerirse desde la etiqueta. */
  private readonly codeTouched = new WeakSet<BreakType>();

  /** Nombre del tipo en el idioma activo (la columna Tipo; la etiqueta es la de la empresa). */
  protected typeLabel(code: string): string {
    return eventLabel(code);
  }

  constructor() {
    this.load();
  }

  /** Las categorías solo tienen sentido con el inicio de descanso habilitado (se lee del interruptor en vivo). */
  protected breaksEnabled(): boolean {
    return this.settings().find((s) => s.eventType === 'INICIO_DESCANSO')?.enabled ?? false;
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    forkJoin({ events: this.service.list(), breaks: this.breakService.list() }).subscribe({
      next: ({ events, breaks }) => {
        // Copias mutables para el ngModel (evita mutar el objeto de la respuesta directamente).
        this.settings.set(events.map((i) => ({ ...i })));
        this.breakTypes.set(breaks.map((b) => ({ ...b })));
        this.removedIds = [];
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  protected addBreakType(): void {
    const rows = this.breakTypes();
    const sortOrder = rows.reduce((max, r) => Math.max(max, r.sortOrder), -1) + 1;
    this.breakTypes.set([
      ...rows,
      { id: null, code: '', label: '', enabled: true, paid: false, maxMinutes: null, sortOrder },
    ]);
  }

  protected removeBreakType(index: number): void {
    const row = this.breakTypes()[index];
    if (row.id) {
      this.removedIds.push(row.id);
    }
    this.breakTypes.set(this.breakTypes().filter((_, i) => i !== index));
  }

  protected onLabelChange(row: BreakType): void {
    if (row.id === null && !this.codeTouched.has(row)) {
      row.code = codeFromLabel(row.label);
    }
  }

  protected onCodeChange(row: BreakType): void {
    this.codeTouched.add(row);
    row.code = row.code.toUpperCase();
  }

  save(): void {
    const rows = this.breakTypes().map((r) => ({
      ...r,
      label: r.label.trim(),
      code: r.code.trim().toUpperCase(),
      maxMinutes: r.maxMinutes ? Number(r.maxMinutes) : null,
    }));
    if (!this.validBreakTypes(rows)) {
      this.notify.error(this.transloco.translate('breakTypes.invalid'));
      return;
    }

    this.saving.set(true);
    let keptInUse = 0;
    // Primero los borrados: así un código liberado puede reutilizarse en una fila nueva.
    const deletes = this.removedIds.map((id) =>
      this.breakService.remove(id).pipe(
        map((r) => {
          if (!r.deleted) keptInUse++;
          return r;
        }),
      ),
    );
    const upserts: Observable<unknown>[] = rows.map((r) =>
      r.id ? this.breakService.update(r) : this.breakService.create(r),
    );

    concat(this.service.update(this.settings()), ...deletes, ...upserts)
      .pipe(toArray())
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notify.success(
            this.transloco.translate(keptInUse > 0 ? 'breakTypes.deactivatedInUse' : 'eventTypes.updated'),
          );
          this.load();
        },
        error: () => {
          this.saving.set(false);
          this.notify.error(this.transloco.translate('common.saveError'));
          // Lo ya guardado quedó en el servidor: se recarga para no reenviar altas duplicadas.
          this.load();
        },
      });
  }

  /** Etiqueta obligatoria, código con formato válido y sin repetir dentro de la empresa. */
  private validBreakTypes(rows: BreakType[]): boolean {
    const codes = new Set<string>();
    for (const r of rows) {
      if (!r.label || !CODE_PATTERN.test(r.code) || codes.has(r.code)) return false;
      if (r.maxMinutes !== null && (!Number.isInteger(r.maxMinutes) || r.maxMinutes < 1)) return false;
      codes.add(r.code);
    }
    return true;
  }
}
