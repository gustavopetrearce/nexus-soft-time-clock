import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthStore } from '../../../core/auth/auth.store';
import { AlertComponent } from '../../../core/ui/alert.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { CompanyPolicy } from './company-policy.models';
import { CompanyPolicyService } from './company-policy.service';
import { CompanyQrCardComponent } from './company-qr-card.component';
import { VacationPolicy, VacationTier } from './vacation-policy.models';
import { VacationPolicyService } from './vacation-policy.service';

/**
 * Configuración de la empresa. Reúne dos políticas independientes, cada una con su propio
 * guardado: las de registro de asistencia (foto, biometría, dispositivo, precisión GPS, que
 * requieren {@code company:settings}) y la escalera de vacaciones ({@code vacation:manage}).
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatSlideToggleModule,
    PageHeaderComponent,
    CompanyQrCardComponent,
    TranslocoPipe,
    AlertComponent,
    LoadingBarComponent,
  ],
  template: `
    <app-page-header [title]="'layout.nav.settings' | transloco" />
    <app-loading-bar [active]="loading() || loadingPolicy()" />
    @if (error()) { <app-alert tone="error">{{ error() }}</app-alert> }

    @if (canEditPolicy()) {
      <section class="nx-panel">
          <h2 class="nx-text-heading-3">{{ 'settings.policy.title' | transloco }}</h2>
          <p class="nx-text-small nx-sec">{{ 'settings.policy.text' | transloco }}</p>
          @if (policyError()) { <app-alert tone="error">{{ policyError() }}</app-alert> }

          <div class="cfg-item">
            <div class="ci-txt">
              <h4>{{ 'settings.policy.photo' | transloco }}</h4>
              <p>{{ 'settings.policy.photoText' | transloco }}</p>
            </div>
            <mat-slide-toggle [(ngModel)]="policy.requirePhoto" color="primary" />
          </div>

          <div class="cfg-item">
            <div class="ci-txt">
              <h4>{{ 'settings.policy.biometric' | transloco }}</h4>
              <p>{{ 'settings.policy.biometricText' | transloco }}</p>
            </div>
            <mat-slide-toggle [(ngModel)]="policy.requireBiometric" color="primary" />
          </div>

          <div class="cfg-item">
            <div class="ci-txt">
              <h4>{{ 'settings.policy.device' | transloco }}</h4>
              <p>{{ 'settings.policy.deviceText' | transloco }}</p>
            </div>
            <mat-slide-toggle [(ngModel)]="policy.deviceBindingEnabled" color="primary" />
          </div>

          @if (policy.deviceBindingEnabled) {
            <div class="cfg-item">
              <div class="ci-txt">
                <h4>{{ 'settings.policy.unknownDevice' | transloco }}</h4>
                <p>{{ 'settings.policy.unknownDeviceText' | transloco }}</p>
              </div>
              <mat-button-toggle-group [(ngModel)]="policy.deviceBindingAction">
                <mat-button-toggle value="REJECT">{{ 'settings.policy.reject' | transloco }}</mat-button-toggle>
                <mat-button-toggle value="FLAG">{{ 'settings.policy.flag' | transloco }}</mat-button-toggle>
              </mat-button-toggle-group>
            </div>
          }

          <div class="cfg-item">
            <div class="ci-txt">
              <h4>{{ 'settings.policy.gps' | transloco }}</h4>
              <p>{{ 'settings.policy.gpsText' | transloco }}</p>
            </div>
            <input class="inline-num nx-campo__caja nx-text-numeric" type="number" min="5" max="500" [(ngModel)]="policy.defaultGpsAccuracyMaxM" [attr.aria-label]="'settings.policy.gps' | transloco" />
          </div>

          <div class="cfg-item">
            <div class="ci-txt">
              <h4>{{ 'settings.policy.siteless' | transloco }}</h4>
              <p [innerHTML]="'settings.policy.sitelessText' | transloco"></p>
            </div>
            <mat-slide-toggle [(ngModel)]="policy.sitelessAttendanceEnabled" color="primary" />
          </div>

          <div class="actions">
            <button mat-button type="button" [disabled]="savingPolicy()" (click)="loadPolicy()">{{ 'common.discard' | transloco }}</button>
            <button mat-flat-button color="primary" [disabled]="savingPolicy()" (click)="savePolicy()">
              <mat-icon>save</mat-icon> {{ 'settings.policy.save' | transloco }}
            </button>
          </div>
        </section>

      <!-- El QR solo tiene sentido con la política ya guardada: el backend rechaza emitirlo si no. -->
      @if (savedSitelessEnabled()) {
        <app-company-qr-card />
      }
    }

    <div class="nx-g-8-4">
      <section class="nx-panel">
          <h2 class="nx-text-heading-3">{{ 'layout.nav.vacations' | transloco }}</h2>
          <p class="nx-text-small nx-sec">{{ 'settings.vacation.text' | transloco }}</p>

          <!-- Escalera editable -->
          <div class="tier-head">
            <span>{{ 'settings.vacation.year' | transloco }}</span><span>{{ 'settings.vacation.days' | transloco }}</span><span></span>
          </div>
          @for (t of model.tiers; track $index) {
            <div class="tier-row">
              <div class="num"><input class="nx-campo__caja nx-text-numeric" type="number" min="1" max="100" [(ngModel)]="t.year" [attr.aria-label]="'settings.vacation.year' | transloco" /></div>
              <div class="num"><input class="nx-campo__caja nx-text-numeric" type="number" min="0" max="366" [(ngModel)]="t.days" [attr.aria-label]="'settings.vacation.days' | transloco" /></div>
              <button mat-icon-button type="button" (click)="removeTier($index)" [disabled]="model.tiers.length <= 1" [attr.aria-label]="'common.remove' | transloco">
                <mat-icon>close</mat-icon>
              </button>
            </div>
          }
          <button mat-stroked-button type="button" class="add" (click)="addTier()">
            <mat-icon>add</mat-icon> {{ 'settings.vacation.addTier' | transloco }}
          </button>

          <!-- Regla más allá del último tramo -->
          <div class="beyond">
            <div class="beyond-title">{{ 'settings.vacation.beyond' | transloco }}</div>
            <mat-button-toggle-group [(ngModel)]="model.beyondMode" hideSingleSelectionIndicator>
              <mat-button-toggle value="FLAT">{{ 'settings.vacation.flat' | transloco }}</mat-button-toggle>
              <mat-button-toggle value="INCREMENT">{{ 'settings.vacation.increment' | transloco }}</mat-button-toggle>
            </mat-button-toggle-group>

            @if (model.beyondMode === 'INCREMENT') {
              <div class="inc">
                {{ 'settings.vacation.add' | transloco }}
                <input type="number" min="0" max="366" [(ngModel)]="model.beyondIncrementDays" class="inline-num nx-campo__caja nx-text-numeric" />
                {{ 'settings.vacation.daysEvery' | transloco }}
                <input type="number" min="1" max="20" [(ngModel)]="model.beyondEveryYears" class="inline-num nx-campo__caja nx-text-numeric" />
                {{ (model.beyondEveryYears === 1 ? 'settings.vacation.yearUnit' : 'settings.vacation.yearsUnit') | transloco }}.
              </div>
            }
          </div>

          <div class="cfg-item">
            <div class="ci-txt">
              <h4>{{ 'settings.vacation.approval' | transloco }}</h4>
              <p>{{ 'settings.vacation.approvalText' | transloco }}</p>
            </div>
            <mat-slide-toggle [(ngModel)]="model.requireApproval" color="primary" />
          </div>
          <div class="cfg-item">
            <div class="ci-txt">
              <h4>{{ 'settings.vacation.businessDays' | transloco }}</h4>
              <p>{{ 'settings.vacation.businessDaysText' | transloco }}</p>
            </div>
            <mat-slide-toggle [(ngModel)]="model.countBusinessDaysOnly" color="primary" />
          </div>

          <div class="actions">
            <button mat-button type="button" [disabled]="saving()" (click)="load()">{{ 'common.discard' | transloco }}</button>
            <button mat-flat-button color="primary" [disabled]="saving()" (click)="save()">
              <mat-icon>save</mat-icon> {{ 'common.saveChanges' | transloco }}
            </button>
          </div>
        </section>

      <section class="nx-panel">
          <div class="info-box">
            <mat-icon aria-hidden="true">info</mat-icon>
            <div [innerHTML]="'settings.vacation.info' | transloco"></div>
          </div>
          <div class="preview">
            <div class="preview-title">{{ 'settings.vacation.preview' | transloco }}</div>
            @for (y of previewYears(); track y) {
              <div class="preview-row"><span>{{ (y === 1 ? 'people.yearOne' : 'people.yearMany') | transloco: { n: y } }}</span><b>{{ 'settings.vacation.nDays' | transloco: { n: entitlement(y) } }}</b></div>
            }
          </div>
        </section>
    </div>
  `,
  styles: [
    `
      h2, p { margin: var(--nx-space-0); }
      .nx-pila, .nx-panel + .nx-panel { margin-top: var(--nx-space-gap-section); }
      .tier-head, .tier-row { display: grid; grid-template-columns: 1fr 1fr var(--nx-size-target-min); gap: var(--nx-space-gap-related); align-items: center; }
      .tier-head { font-size: var(--nx-text-heading-5-size); font-weight: var(--nx-font-weight-semibold); text-transform: uppercase; letter-spacing: var(--nx-font-tracking-wide); color: var(--nx-color-text-secondary); }
      .num input, .inline-num { width: 100%; background: var(--nx-color-surface-default); font: inherit; text-align: center; }
      .inline-num { width: calc(var(--nx-space-16) + var(--nx-space-2)); }
      .add { align-self: flex-start; }
      .beyond { display: flex; flex-direction: column; gap: var(--nx-space-gap-related); padding: var(--nx-space-inset-card); border: var(--nx-border-width-default) solid var(--nx-color-border-default); border-radius: var(--nx-radius-md); background: var(--nx-color-surface-subtle); }
      .beyond-title { font-size: var(--nx-text-small-size); font-weight: var(--nx-font-weight-semibold); }
      .inc { display: flex; align-items: center; gap: var(--nx-space-gap-inline); flex-wrap: wrap; }
      .cfg-item { display: flex; align-items: center; gap: var(--nx-space-gap-group); padding-top: var(--nx-space-gap-related); border-top: var(--nx-border-width-default) solid var(--nx-color-border-default); }
      .ci-txt { flex: 1; }
      .ci-txt h4 { margin: var(--nx-space-0); font-size: var(--nx-text-body-size); font-weight: var(--nx-font-weight-semibold); }
      .ci-txt p { font-size: var(--nx-text-small-size); color: var(--nx-color-text-secondary); }
      .actions { display: flex; justify-content: flex-end; gap: var(--nx-space-gap-inline); }
      .info-box { display: flex; gap: var(--nx-space-gap-related); font-size: var(--nx-text-small-size); line-height: var(--nx-font-line-height-150); }
      .info-box mat-icon { color: var(--nx-color-status-info-fg); flex: none; }
      .preview { display: flex; flex-direction: column; gap: var(--nx-space-1); padding-top: var(--nx-space-gap-related); border-top: var(--nx-border-width-default) solid var(--nx-color-border-default); }
      .preview-title { font-size: var(--nx-text-heading-5-size); font-weight: var(--nx-font-weight-semibold); text-transform: uppercase; letter-spacing: var(--nx-font-tracking-wide); color: var(--nx-color-text-secondary); }
      .preview-row { display: flex; justify-content: space-between; }
    `,
  ],
})
export class SettingsComponent {
  private readonly service = inject(VacationPolicyService);
  private readonly policyService = inject(CompanyPolicyService);
  private readonly auth = inject(AuthStore);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);

  protected model: VacationPolicy = {
    tiers: [{ year: 1, days: 12 }],
    beyondMode: 'FLAT',
    beyondIncrementDays: 0,
    beyondEveryYears: 1,
    requireApproval: true,
    countBusinessDaysOnly: true,
  };
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Políticas de registro. Se cargan y guardan aparte de las de vacaciones: distinto permiso. */
  protected policy: CompanyPolicy = {
    defaultGpsAccuracyMaxM: 50,
    requirePhoto: false,
    requireBiometric: false,
    deviceBindingEnabled: true,
    deviceBindingAction: 'REJECT',
    sitelessAttendanceEnabled: false,
  };
  /**
   * Valor de la bandera tal como está <b>guardado</b>, no como lo tiene el formulario. La tarjeta
   * del QR se apoya en esto porque el backend rechaza emitirlo mientras la política no esté
   * persistida, y ofrecer el botón antes de guardar solo produce un error inexplicable.
   */
  protected readonly savedSitelessEnabled = signal(false);
  protected readonly loadingPolicy = signal(false);
  protected readonly savingPolicy = signal(false);
  protected readonly policyError = signal<string | null>(null);

  constructor() {
    this.load();
    if (this.canEditPolicy()) {
      this.loadPolicy();
    }
  }

  protected canEditPolicy(): boolean {
    return this.auth.hasPermission('company:settings');
  }

  protected loadPolicy(): void {
    this.loadingPolicy.set(true);
    this.policyError.set(null);
    this.policyService.get().subscribe({
      next: (p) => {
        this.policy = { ...p };
        this.savedSitelessEnabled.set(p.sitelessAttendanceEnabled);
        this.loadingPolicy.set(false);
      },
      error: () => {
        this.policyError.set(this.transloco.translate('settings.policy.loadError'));
        this.loadingPolicy.set(false);
      },
    });
  }

  protected savePolicy(): void {
    this.savingPolicy.set(true);
    this.policyService.update({ ...this.policy }).subscribe({
      next: (p) => {
        this.policy = { ...p };
        this.savedSitelessEnabled.set(p.sitelessAttendanceEnabled);
        this.savingPolicy.set(false);
        this.notify.success(this.transloco.translate('settings.policy.saved'));
      },
      error: () => {
        this.savingPolicy.set(false);
        this.notify.error(this.transloco.translate('settings.policy.saveError'));
      },
    });
  }

  protected addTier(): void {
    const nextYear = this.model.tiers.length ? Math.max(...this.model.tiers.map((t) => t.year)) + 1 : 1;
    const lastDays = this.model.tiers.length ? this.model.tiers[this.model.tiers.length - 1].days : 0;
    this.model.tiers = [...this.model.tiers, { year: nextYear, days: lastDays }];
  }

  protected removeTier(index: number): void {
    this.model.tiers = this.model.tiers.filter((_, i) => i !== index);
  }

  /** Años a mostrar en la vista previa: los tramos definidos + algunos posteriores. */
  protected previewYears(): number[] {
    const years = new Set<number>(this.model.tiers.map((t) => Math.floor(t.year)).filter((y) => y >= 1));
    const last = years.size ? Math.max(...years) : 1;
    const step = this.model.beyondMode === 'INCREMENT' ? Math.max(1, this.model.beyondEveryYears) : 5;
    years.add(last + step);
    years.add(last + step * 2);
    years.add(last + step * 4);
    return [...years].sort((a, b) => a - b);
  }

  /** Días de derecho para `years` años completos (mismo cálculo que el backend). */
  protected entitlement(years: number): number {
    const tiers = this.model.tiers;
    if (years < 1 || !tiers?.length) return 0;
    let applicable: VacationTier | null = null;
    let last = tiers[0];
    for (const t of tiers) {
      if (t.year <= years && (!applicable || t.year > applicable.year)) applicable = t;
      if (t.year > last.year) last = t;
    }
    if (!applicable) return 0;
    if (years <= last.year) return applicable.days;
    if (this.model.beyondMode === 'INCREMENT' && this.model.beyondEveryYears > 0) {
      const blocks = Math.floor((years - last.year) / this.model.beyondEveryYears);
      return last.days + blocks * this.model.beyondIncrementDays;
    }
    return last.days;
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (policy) => {
        this.model = { ...policy, tiers: [...(policy.tiers ?? [])].sort((a, b) => a.year - b.year) };
        if (!this.model.tiers.length) this.model.tiers = [{ year: 1, days: 12 }];
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.transloco.translate('settings.vacation.loadError'));
        this.loading.set(false);
      },
    });
  }

  save(): void {
    const tiers = [...this.model.tiers]
      .map((t) => ({ year: Math.floor(t.year), days: Math.floor(t.days) }))
      .sort((a, b) => a.year - b.year);
    this.saving.set(true);
    this.service.update({ ...this.model, tiers }).subscribe({
      next: (policy) => {
        this.model = { ...policy, tiers: [...(policy.tiers ?? [])].sort((a, b) => a.year - b.year) };
        this.saving.set(false);
        this.notify.success(this.transloco.translate('settings.vacation.saved'));
      },
      error: () => {
        this.saving.set(false);
        this.notify.error(this.transloco.translate('settings.vacation.saveError'));
      },
    });
  }
}
