import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AppNumberPipe } from '../../../core/i18n/app-number.pipe';
import { AlertComponent } from '../../../core/ui/alert.component';
import { ConfirmDialogComponent } from '../../../core/ui/confirm-dialog.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
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
 * P24 · Cupo de colaboradores activos de una empresa (RF-29, HU-27).
 *
 * Solo el SUPER_ADMIN llega aquí (`company:capacity`). Se edita el **total** de bloques, no un
 * incremento, y la pantalla muestra el límite resultante antes de guardar para que nadie tenga que
 * multiplicar de cabeza. La reducción por debajo del uso la rechaza el backend (RN-34/D-09): aquí
 * se avisa antes para no gastar un viaje, pero el mensaje que manda es el suyo. Subir bloques guarda
 * directo; quitarlos se confirma (S01).
 */
@Component({
  selector: 'app-capacity-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe, AppNumberPipe, AlertComponent, LoadingBarComponent],
  styles: [`h2, dl, dd, p { margin: var(--nx-space-0); }`],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3" mat-dialog-title>{{ 'capacity.title' | transloco: { name: data.company.name } }}</h2>
    </div>

    <div class="nx-capa__cuerpo" aria-live="polite">
      <app-loading-bar [active]="loading() || saving()" />
      @if (!loading() && !capacity()) {
        <app-alert tone="error">{{ error() }}</app-alert>
      }
      @if (capacity(); as c) {
        @if (belowUsage()) {
          <app-alert tone="error">
            {{ 'capacity.belowUsage' | transloco: { limit: (proposedLimit() | appNumber), used: (c.used | appNumber), excess: (c.used - proposedLimit() | appNumber) } }}
          </app-alert>
        }
        <dl class="nx-datos">
          <div class="nx-dato">
            <dt class="nx-text-heading-6">{{ 'capacity.currentLimit' | transloco }}</dt>
            <dd class="nx-text-numeric">{{ c.limit | appNumber }}</dd>
          </div>
          <div class="nx-dato">
            <dt class="nx-text-heading-6">{{ 'capacity.used' | transloco }}</dt>
            <dd class="nx-text-numeric">{{ c.used | appNumber }}</dd>
          </div>
        </dl>

        <div class="nx-numerico">
          <span class="nx-campo__label" id="bloques-label">{{ 'capacity.extraBlocks' | transloco }}</span>
          <div class="nx-numerico__ctrl" role="group" aria-labelledby="bloques-label">
            <button mat-icon-button type="button" [attr.aria-label]="'capacity.removeBlock' | transloco" [disabled]="blocks() === 0 || saving()" (click)="step(-1)">
              <mat-icon>remove</mat-icon>
            </button>
            <span class="nx-numerico__valor nx-text-numeric" aria-live="polite">{{ blocks() }}</span>
            <button mat-icon-button type="button" [attr.aria-label]="'capacity.addBlock' | transloco" [disabled]="saving()" (click)="step(1)">
              <mat-icon>add</mat-icon>
            </button>
          </div>
          <span class="nx-campo__ayuda nx-text-small nx-sec">{{ 'capacity.formula' | transloco: { base: c.baseLimit, size: c.blockSize } }}</span>
        </div>

        <dl class="nx-datos">
          <div class="nx-dato">
            <dt class="nx-text-heading-6">{{ 'capacity.resultingLimit' | transloco }}</dt>
            <dd class="nx-text-numeric">{{ proposedLimit() | appNumber }}</dd>
          </div>
        </dl>
      }
    </div>

    <div class="nx-capa__pie">
      <button mat-button type="button" [disabled]="saving()" (click)="close(false)"><mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button type="button" [disabled]="saving() || loading() || !dirty() || belowUsage()" (click)="save()">
        <mat-icon>save</mat-icon>{{ 'common.save' | transloco }}
      </button>
    </div>
  `,
})
export class CapacityDialogComponent {
  private readonly service = inject(CompanyService);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly dialog = inject(MatDialog);
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
    const current = this.capacity()?.extraBlocks ?? 0;
    if (this.blocks() >= current) {
      this.persist();
      return;
    }
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: this.transloco.translate('capacity.reduceTitle', { name: this.data.company.name }),
          message: this.transloco.translate('capacity.reduceMessage', { limit: this.proposedLimit() }),
          confirmText: this.transloco.translate('capacity.reduce'),
          color: 'warn',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) this.persist();
      });
  }

  private persist(): void {
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
