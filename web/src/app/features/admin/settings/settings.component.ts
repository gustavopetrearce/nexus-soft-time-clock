import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthStore } from '../../../core/auth/auth.store';
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
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatSlideToggleModule,
    MatProgressBarModule,
    PageHeaderComponent,
    CompanyQrCardComponent,
    TranslocoPipe,
  ],
  template: `
    <app-page-header [title]="'layout.nav.settings' | transloco" [subtitle]="'settings.subtitle' | transloco" />
    @if (error()) { <p class="error-text">{{ error() }}</p> }
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }

    @if (canEditPolicy()) {
      <mat-card class="policy-card">
        <mat-card-content>
          <div class="card-head"><mat-icon>verified_user</mat-icon><h3>{{ 'settings.policy.title' | transloco }}</h3></div>
          <p class="muted sub">{{ 'settings.policy.text' | transloco }}</p>
          @if (policyError()) { <p class="error-text">{{ policyError() }}</p> }
          @if (loadingPolicy()) { <mat-progress-bar mode="indeterminate" /> }

          <div class="cfg-item">
            <div class="ci-ic"><mat-icon>photo_camera</mat-icon></div>
            <div class="ci-txt">
              <h4>{{ 'settings.policy.photo' | transloco }}</h4>
              <p>{{ 'settings.policy.photoText' | transloco }}</p>
            </div>
            <mat-slide-toggle [(ngModel)]="policy.requirePhoto" color="primary" />
          </div>

          <div class="cfg-item">
            <div class="ci-ic"><mat-icon>fingerprint</mat-icon></div>
            <div class="ci-txt">
              <h4>{{ 'settings.policy.biometric' | transloco }}</h4>
              <p>{{ 'settings.policy.biometricText' | transloco }}</p>
            </div>
            <mat-slide-toggle [(ngModel)]="policy.requireBiometric" color="primary" />
          </div>

          <div class="cfg-item">
            <div class="ci-ic"><mat-icon>smartphone</mat-icon></div>
            <div class="ci-txt">
              <h4>{{ 'settings.policy.device' | transloco }}</h4>
              <p>{{ 'settings.policy.deviceText' | transloco }}</p>
            </div>
            <mat-slide-toggle [(ngModel)]="policy.deviceBindingEnabled" color="primary" />
          </div>

          @if (policy.deviceBindingEnabled) {
            <div class="cfg-item">
              <div class="ci-ic"><mat-icon>gpp_maybe</mat-icon></div>
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
            <div class="ci-ic"><mat-icon>my_location</mat-icon></div>
            <div class="ci-txt">
              <h4>{{ 'settings.policy.gps' | transloco }}</h4>
              <p>{{ 'settings.policy.gpsText' | transloco }}</p>
            </div>
            <input class="inline-num" type="number" min="5" max="500" [(ngModel)]="policy.defaultGpsAccuracyMaxM" />
          </div>

          <div class="cfg-item">
            <div class="ci-ic"><mat-icon>travel_explore</mat-icon></div>
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
        </mat-card-content>
      </mat-card>

      <!-- El QR solo tiene sentido con la política ya guardada: el backend rechaza emitirlo si no. -->
      @if (savedSitelessEnabled()) {
        <app-company-qr-card />
      }
    }

    <div class="cfg-grid">
      <mat-card>
        <mat-card-content>
          <div class="card-head"><mat-icon>beach_access</mat-icon><h3>{{ 'layout.nav.vacations' | transloco }}</h3></div>
          <p class="muted sub">{{ 'settings.vacation.text' | transloco }}</p>

          <!-- Escalera editable -->
          <div class="tier-head">
            <span>{{ 'settings.vacation.year' | transloco }}</span><span>{{ 'settings.vacation.days' | transloco }}</span><span></span>
          </div>
          @for (t of model.tiers; track $index) {
            <div class="tier-row">
              <div class="num"><input type="number" min="1" max="100" [(ngModel)]="t.year" /></div>
              <div class="num"><input type="number" min="0" max="366" [(ngModel)]="t.days" /></div>
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
                <input type="number" min="0" max="366" [(ngModel)]="model.beyondIncrementDays" class="inline-num" />
                {{ 'settings.vacation.daysEvery' | transloco }}
                <input type="number" min="1" max="20" [(ngModel)]="model.beyondEveryYears" class="inline-num" />
                {{ (model.beyondEveryYears === 1 ? 'settings.vacation.yearUnit' : 'settings.vacation.yearsUnit') | transloco }}.
              </div>
            }
          </div>

          <div class="cfg-item">
            <div class="ci-ic"><mat-icon>verified_user</mat-icon></div>
            <div class="ci-txt">
              <h4>{{ 'settings.vacation.approval' | transloco }}</h4>
              <p>{{ 'settings.vacation.approvalText' | transloco }}</p>
            </div>
            <mat-slide-toggle [(ngModel)]="model.requireApproval" color="primary" />
          </div>
          <div class="cfg-item">
            <div class="ci-ic"><mat-icon>calendar_month</mat-icon></div>
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
        </mat-card-content>
      </mat-card>

      <mat-card>
        <mat-card-content>
          <div class="info-box">
            <mat-icon>info</mat-icon>
            <div [innerHTML]="'settings.vacation.info' | transloco"></div>
          </div>
          <div class="preview">
            <div class="preview-title">{{ 'settings.vacation.preview' | transloco }}</div>
            @for (y of previewYears(); track y) {
              <div class="preview-row"><span>{{ (y === 1 ? 'people.yearOne' : 'people.yearMany') | transloco: { n: y } }}</span><b>{{ 'settings.vacation.nDays' | transloco: { n: entitlement(y) } }}</b></div>
            }
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .cfg-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: var(--nx-space-4); align-items: start; }
      @media (max-width: 1000px) { .cfg-grid { grid-template-columns: 1fr; } }
      .card-head { display: flex; align-items: center; gap: 10px; }
      .card-head mat-icon { color: var(--nx-color-action-primary); }
      .card-head h3 { margin: 0; font-size: 1.05rem; font-weight: var(--nx-font-weight-bold); }
      .sub { margin: 4px 0 12px; font-size: var(--nx-text-small-size); }
      .tier-head, .tier-row { display: grid; grid-template-columns: 1fr 1fr 44px; gap: var(--nx-space-3); align-items: center; }
      .tier-head { font-size: var(--nx-text-caption-size); font-weight: var(--nx-font-weight-bold); text-transform: uppercase; letter-spacing: .04em; color: var(--nx-color-text-secondary); padding: 0 4px 6px; }
      .tier-row { padding: 4px 0; }
      .num input, .inline-num { border: 1px solid var(--nx-color-border-strong); border-radius: 8px; background: var(--nx-color-surface-default); color: var(--nx-color-text-primary); font: inherit; padding: 9px 10px; width: 100%; text-align: center; font-weight: var(--nx-font-weight-semibold); }
      .num input:focus, .inline-num:focus { outline: none; border-color: var(--nx-color-action-primary); box-shadow: 0 0 0 3px var(--nx-color-action-primary-subtle); }
      .add { margin-top: var(--nx-space-2); }
      .beyond { margin: var(--nx-space-4) 0; padding: var(--nx-space-4); border: 1px solid var(--nx-color-border-default); border-radius: var(--nx-radius-md); background: var(--nx-color-surface-subtle); }
      .beyond-title { font-size: var(--nx-text-small-size); font-weight: var(--nx-font-weight-semibold); margin-bottom: var(--nx-space-2); }
      .inc { margin-top: var(--nx-space-3); font-size: var(--nx-text-body-size); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .inline-num { width: 64px; }
      .policy-card { margin-bottom: var(--nx-space-4); }
      .cfg-item { display: flex; align-items: center; gap: var(--nx-space-4); padding: var(--nx-space-4) 0; border-top: 1px solid var(--nx-color-border-default); }
      .ci-ic { width: 40px; height: 40px; border-radius: 11px; background: var(--nx-color-action-primary-subtle); border: 1px solid var(--nx-color-border-brand); color: var(--nx-color-action-primary); display: grid; place-items: center; flex: none; }
      .ci-txt { flex: 1; }
      .ci-txt h4 { margin: 0; font-size: var(--nx-text-body-size); font-weight: var(--nx-font-weight-semibold); }
      .ci-txt p { margin: 3px 0 0; font-size: var(--nx-text-small-size); color: var(--nx-color-text-secondary); }
      .actions { margin-top: var(--nx-space-4); display: flex; justify-content: flex-end; gap: var(--nx-space-2); }
      .info-box { display: flex; gap: 11px; padding: 4px; color: var(--nx-color-text-primary); font-size: var(--nx-text-small-size); line-height: 1.5; }
      .info-box mat-icon { color: var(--nx-color-status-info-fg); flex: none; }
      .preview { margin-top: var(--nx-space-4); border-top: 1px solid var(--nx-color-border-default); padding-top: var(--nx-space-3); }
      .preview-title { font-size: var(--nx-text-small-size); font-weight: var(--nx-font-weight-bold); text-transform: uppercase; letter-spacing: .04em; color: var(--nx-color-text-secondary); margin-bottom: var(--nx-space-2); }
      .preview-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: var(--nx-text-body-size); }
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
