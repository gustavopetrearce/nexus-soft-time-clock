import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { NotificationService } from '../../../core/ui/notification.service';
import { localizedProblem } from '../../../core/ui/problem-detail';
import { Company, TenantCapacity } from './company.models';
import { CompanyService } from './company.service';

export interface CapacityDialogData {
  company: Company;
  /** Cupo ya cargado por el listado; evita una segunda petición al abrir. */
  capacity?: TenantCapacity;
}

/**
 * Cupo de colaboradores activos de una empresa (RF-29, HU-27).
 *
 * Solo el SUPER_ADMIN llega aquí (`company:capacity`). Se edita el **total** de bloques, no un
 * incremento, y la pantalla muestra el límite resultante antes de guardar para que nadie tenga que
 * multiplicar de cabeza. La reducción por debajo del uso la rechaza el backend (RN-34/D-09): aquí
 * se avisa antes para no gastar un viaje, pero el mensaje que manda es el suyo.
 */
@Component({
  selector: 'app-capacity-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressBarModule, TranslocoPipe],
  template: `
    <h2 mat-dialog-title>{{ 'capacity.title' | transloco: { name: data.company.name } }}</h2>

    <mat-dialog-content>
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      @if (!loading() && !capacity()) {
        <p class="error-text">{{ error() }}</p>
      }
      @if (capacity(); as c) {
        <div class="usage">
          <div class="usage-head">
            <span class="big">{{ c.used }}</span>
            <span class="of">{{ 'capacity.ofActive' | transloco: { limit: c.limit } }}</span>
          </div>
          <div class="bar" [class.full]="c.available === 0">
            <div class="fill" [style.width.%]="fillPercent()"></div>
          </div>
          <p class="hint">
            {{ 'capacity.summary' | transloco: { available: c.available, base: c.baseLimit, blocks: c.extraBlocks, size: c.blockSize } }}
          </p>
        </div>

        <div class="blocks">
          <span class="label">{{ 'capacity.extraBlocks' | transloco }}</span>
          <div class="stepper">
            <button
              mat-icon-button
              type="button"
              [attr.aria-label]="'capacity.removeBlock' | transloco"
              [disabled]="blocks() === 0 || saving()"
              (click)="step(-1)"
            >
              <mat-icon>remove</mat-icon>
            </button>
            <span class="count">{{ blocks() }}</span>
            <button
              mat-icon-button
              type="button"
              [attr.aria-label]="'capacity.addBlock' | transloco"
              [disabled]="saving()"
              (click)="step(1)"
            >
              <mat-icon>add</mat-icon>
            </button>
          </div>
          <span class="result">
            {{ 'capacity.resultingLimit' | transloco }} <strong>{{ proposedLimit() }}</strong>
            @if (proposedLimit() !== c.limit) { <em>{{ 'capacity.current' | transloco: { limit: c.limit } }}</em> }
          </span>
        </div>

        @if (belowUsage()) {
          <p class="warn">
            <mat-icon>warning</mat-icon>
            {{ 'capacity.belowUsage' | transloco: { blocks: blocks(), limit: proposedLimit(), used: c.used, excess: c.used - proposedLimit() } }}
          </p>
        }
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button [disabled]="saving()" (click)="close(false)">{{ 'common.cancel' | transloco }}</button>
      <button
        mat-flat-button
        color="primary"
        [disabled]="saving() || loading() || !dirty() || belowUsage()"
        (click)="save()"
      >
        {{ 'capacity.save' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      mat-dialog-content { min-width: min(460px, 80vw); }

      .usage-head { display: flex; align-items: baseline; gap: 8px; }
      .usage-head .big { font-size: 2rem; font-weight: var(--nx-font-weight-bold); letter-spacing: -0.02em; }
      .usage-head .of { color: var(--nx-color-text-secondary); }

      .bar {
        margin: 10px 0 6px;
        height: 8px;
        border-radius: var(--nx-radius-full);
        background: var(--nx-color-surface-subtle);
        overflow: hidden;
      }
      .bar .fill { height: 100%; background: var(--nx-color-action-primary); transition: width 0.2s var(--nx-motion-easing-standard); }
      .bar.full .fill { background: var(--nx-color-status-warning-fg); }

      .hint { margin: 0; color: var(--nx-color-text-secondary); font-size: var(--nx-text-small-size); }

      .blocks {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid var(--nx-color-border-default);
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
      }
      .blocks .label { font-weight: var(--nx-font-weight-semibold); }
      .stepper { display: flex; align-items: center; gap: 4px; }
      .stepper .count {
        min-width: 2.5ch;
        text-align: center;
        font-variant-numeric: tabular-nums;
        font-weight: var(--nx-font-weight-bold);
        font-size: 1.1rem;
      }
      .blocks .result { color: var(--nx-color-text-secondary); font-size: var(--nx-text-small-size); }

      .warn {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin: 16px 0 0;
        padding: 10px 12px;
        border-radius: 10px;
        background: var(--nx-color-status-warning-bg);
        color: var(--nx-color-status-warning-fg);
        font-size: var(--nx-text-small-size);
      }
      .warn mat-icon { font-size: 18px; width: 18px; height: 18px; }
    `,
  ],
})
export class CapacityDialogComponent {
  private readonly service = inject(CompanyService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly dialogRef = inject(MatDialogRef<CapacityDialogComponent, boolean>);
  protected readonly data = inject<CapacityDialogData>(MAT_DIALOG_DATA);

  protected readonly capacity = signal<TenantCapacity | null>(this.data.capacity ?? null);
  protected readonly blocks = signal(this.data.capacity?.extraBlocks ?? 0);
  protected readonly loading = signal(!this.data.capacity);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly proposedLimit = computed(() => {
    const c = this.capacity();
    return c ? c.baseLimit + this.blocks() * c.blockSize : 0;
  });

  protected readonly dirty = computed(() => this.blocks() !== (this.capacity()?.extraBlocks ?? 0));

  protected readonly belowUsage = computed(() => {
    const c = this.capacity();
    return !!c && c.used > this.proposedLimit();
  });

  protected readonly fillPercent = computed(() => {
    const c = this.capacity();
    if (!c || c.limit === 0) {
      return 0;
    }
    return Math.min(100, Math.round((c.used / c.limit) * 100));
  });

  constructor() {
    if (!this.data.capacity) {
      this.load();
    }
  }

  private load(): void {
    this.service.getCapacity(this.data.company.id).subscribe({
      next: (capacity) => {
        this.capacity.set(capacity);
        this.blocks.set(capacity.extraBlocks);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(localizedProblem(this.transloco, err, 'capacity.loadError'));
        this.loading.set(false);
      },
    });
  }

  protected step(delta: number): void {
    this.blocks.set(Math.max(0, this.blocks() + delta));
  }

  protected save(): void {
    this.saving.set(true);
    this.service.setExtraBlocks(this.data.company.id, this.blocks()).subscribe({
      next: (capacity) => {
        this.saving.set(false);
        this.capacity.set(capacity);
        this.notify.success(this.transloco.translate('capacity.updated', { limit: capacity.limit }));
        this.close(true);
      },
      error: (err) => {
        this.saving.set(false);
        this.notify.error(localizedProblem(this.transloco, err, 'capacity.updateError'));
      },
    });
  }

  protected close(changed: boolean): void {
    this.dialogRef.close(changed);
  }
}
