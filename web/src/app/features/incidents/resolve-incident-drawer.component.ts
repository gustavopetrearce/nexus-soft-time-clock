import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AppDatePipe } from '../../core/i18n/app-date.pipe';
import { AlertComponent } from '../../core/ui/alert.component';
import { NotificationService } from '../../core/ui/notification.service';
import { ScrollDirective } from '../../core/ui/scroll.directive';
import { StatusChipComponent } from '../../core/ui/status-chip.component';
import { INCIDENT_RESOLUTIONS, Incident, IncidentResolution } from './incident.models';
import { IncidentService } from './incident.service';
import { incidentTypeLabel, priorityLabel } from './incident.labels';

export interface ResolveIncidentData {
  incident: Incident;
  /** Abiertas que siguen a la actual en la bandeja, para «Guardar y abrir siguiente». */
  queue: Incident[];
}

const NOTE_MAX = 1000;

/**
 * P14 · Resolver incidencia (drawer). Decisión obligatoria (Aprobar · Rechazar · Resolver) y nota
 * de hasta 1000. «Guardar y abrir siguiente» encadena la siguiente abierta con un fundido del cuerpo
 * y lo anuncia; si otra persona ya la resolvió (409) se avisa sin cerrar el drawer.
 */
@Component({
  selector: 'app-resolve-incident-drawer',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    TranslocoPipe,
    AppDatePipe,
    AlertComponent,
    StatusChipComponent,
    ScrollDirective,
  ],
  styles: [
    `
      h2, dl, dd { margin: var(--nx-space-0); }
      .contenido { display: flex; flex-direction: column; gap: var(--nx-space-gap-group); animation: nx-fade var(--nx-motion-duration-medium) var(--nx-motion-easing-enter); }
      mat-radio-group { display: flex; flex-wrap: wrap; gap: var(--nx-space-gap-inline); }
      mat-form-field { width: 100%; }
    `,
  ],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3">{{ 'incidents.resolveTitle' | transloco }}</h2>
      <button mat-icon-button type="button" mat-dialog-close [attr.aria-label]="'common.close' | transloco">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <div class="nx-capa__cuerpo nx-scroll" nxScroll aria-live="polite">
      <span class="nx-sr-only">{{ announcement() }}</span>
      <!-- Una vuelta por incidencia: al pasar a la siguiente se recrea el contenido y se funde. -->
      @for (i of [current()]; track i.id) {
      <div class="contenido">
      @if (notOpen()) {
        <app-alert tone="error">{{ 'incidents.notOpen' | transloco }}</app-alert>
      }

      <dl class="nx-datos">
        <div class="nx-dato">
          <dt class="nx-text-heading-6">{{ 'incidents.collaborator' | transloco }}</dt>
          <dd>{{ i.userName || i.userId }}</dd>
        </div>
        <div class="nx-dato">
          <dt class="nx-text-heading-6">{{ 'incidents.type' | transloco }}</dt>
          <dd>{{ typeLabel(i.type) }}</dd>
        </div>
        <div class="nx-dato">
          <dt class="nx-text-heading-6">{{ 'incidents.priority' | transloco }}</dt>
          <dd><app-status-chip [status]="i.priority" [label]="priorityLabel(i.priority)" /></dd>
        </div>
        <div class="nx-dato">
          <dt class="nx-text-heading-6">{{ 'incidents.date' | transloco }}</dt>
          <dd><span class="nx-text-numeric">{{ i.incidentDate | appDate: 'dd/MM/yyyy' }}</span></dd>
        </div>
        @if (i.description) {
          <div class="nx-dato">
            <dt class="nx-text-heading-6">{{ 'incidents.description' | transloco }}</dt>
            <dd>{{ i.description }}</dd>
          </div>
        }
      </dl>

      @if (i.status === 'OPEN') {
      <form [formGroup]="form" (ngSubmit)="save(false)" id="resolver-incidencia">
        <div class="nx-opciones">
          <span class="nx-campo__label" id="decision-label">{{ 'incidents.decision' | transloco }} <span aria-hidden="true">*</span></span>
          <mat-radio-group formControlName="status" aria-labelledby="decision-label" required>
            @for (r of resolutions; track r) {
              <mat-radio-button [value]="r">{{ 'incidents.decisions.' + r | transloco }}</mat-radio-button>
            }
          </mat-radio-group>
        </div>

        <mat-form-field appearance="outline">
          <mat-label>{{ 'incidents.note' | transloco }}</mat-label>
          <textarea matInput formControlName="note" rows="4" [maxlength]="noteMax" [placeholder]="'incidents.notePlaceholder' | transloco"></textarea>
          <mat-hint align="end" class="nx-text-numeric">{{ noteLength() }}/{{ noteMax }}</mat-hint>
        </mat-form-field>
      </form>
      } @else {
        <!-- Ya resuelta: se consulta la decisión, sin formulario. -->
        <dl class="nx-datos">
          <div class="nx-dato">
            <dt class="nx-text-heading-6">{{ 'common.status' | transloco }}</dt>
            <dd><app-status-chip [status]="i.status" /></dd>
          </div>
          @if (i.resolvedAt) {
            <div class="nx-dato">
              <dt class="nx-text-heading-6">{{ 'incidents.resolvedAt' | transloco }}</dt>
              <dd><span class="nx-text-numeric">{{ i.resolvedAt | appDate: 'dd/MM/yyyy HH:mm' }}</span></dd>
            </div>
          }
          @if (i.resolutionNote) {
            <div class="nx-dato">
              <dt class="nx-text-heading-6">{{ 'incidents.note' | transloco }}</dt>
              <dd>{{ i.resolutionNote }}</dd>
            </div>
          }
        </dl>
      }
      </div>
      }
    </div>

    <div class="nx-capa__pie">
      @if (current().status !== 'OPEN') {
        <button mat-flat-button type="button" mat-dialog-close>{{ 'common.close' | transloco }}</button>
      } @else {
      <button mat-button type="button" mat-dialog-close><mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}</button>
      @if (queue().length > 0) {
        <button mat-stroked-button type="button" [disabled]="saving()" (click)="save(true)">{{ 'incidents.saveAndNext' | transloco }}</button>
      }
      <button mat-flat-button type="submit" form="resolver-incidencia" [disabled]="saving()" [attr.aria-busy]="saving()">
        @if (saving()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>save</mat-icon> }
        {{ 'common.save' | transloco }}
      </button>
      }
    </div>
  `,
})
export class ResolveIncidentDrawerComponent {
  private readonly data = inject<ResolveIncidentData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ResolveIncidentDrawerComponent>>(MatDialogRef);
  private readonly service = inject(IncidentService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);

  protected readonly resolutions = INCIDENT_RESOLUTIONS;
  protected readonly noteMax = NOTE_MAX;

  protected readonly current = signal(this.data.incident);
  protected readonly queue = signal(this.data.queue);
  protected readonly saving = signal(false);
  protected readonly notOpen = signal(false);
  protected readonly announcement = signal('');
  /** Se resolvió al menos una (o ya no estaba abierta): la bandeja recarga al cerrar. */
  resolvedAny = false;

  protected readonly form = this.fb.nonNullable.group({
    status: this.fb.nonNullable.control<IncidentResolution | ''>('', Validators.required),
    note: ['', Validators.maxLength(NOTE_MAX)],
  });

  private readonly note = toSignal(this.form.controls.note.valueChanges, { initialValue: '' });
  protected readonly noteLength = computed(() => this.note().length);

  protected save(openNext: boolean): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { status, note } = this.form.getRawValue();
    this.saving.set(true);
    this.notOpen.set(false);
    this.service.resolve(this.current().id, { status: status as IncidentResolution, note: note || undefined }).subscribe({
      next: () => {
        this.saving.set(false);
        this.resolvedAny = true;
        this.notify.success(this.transloco.translate('incidents.resolved'));
        if (openNext) this.openNext();
        else this.ref.close();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        if (err instanceof HttpErrorResponse && err.status === 409) {
          this.resolvedAny = true; // la bandeja ya no la muestra abierta
          this.notOpen.set(true);
        } else {
          this.notify.error(this.transloco.translate('incidents.resolveError'));
        }
      },
    });
  }

  private openNext(): void {
    const [next, ...rest] = this.queue();
    if (!next) {
      this.ref.close();
      return;
    }
    this.current.set(next);
    this.queue.set(rest);
    this.notOpen.set(false);
    this.form.reset({ status: '', note: '' });
    this.announcement.set(
      this.transloco.translate('incidents.nextOpened', { name: next.userName || next.userId, type: this.typeLabel(next.type) }),
    );
  }

  protected typeLabel(type: string): string {
    return incidentTypeLabel(type);
  }

  protected priorityLabel(priority: string): string {
    return priorityLabel(priority);
  }
}
