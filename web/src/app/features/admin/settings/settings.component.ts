import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

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
  ],
  template: `
    <app-page-header title="Configuración" subtitle="Parámetros generales de la empresa. Aplican a todo el tenant." />
    @if (error()) { <p class="error-text">{{ error() }}</p> }
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }

    @if (canEditPolicy()) {
      <mat-card class="policy-card">
        <mat-card-content>
          <div class="card-head"><mat-icon>verified_user</mat-icon><h3>Políticas de registro</h3></div>
          <p class="muted sub">
            Valores por defecto para todos los centros. Cada centro puede sobrescribirlos desde su ficha;
            los que queden en «Heredar» usarán lo definido aquí.
          </p>
          @if (policyError()) { <p class="error-text">{{ policyError() }}</p> }
          @if (loadingPolicy()) { <mat-progress-bar mode="indeterminate" /> }

          <div class="cfg-item">
            <div class="ci-ic"><mat-icon>photo_camera</mat-icon></div>
            <div class="ci-txt">
              <h4>Evidencia fotográfica obligatoria</h4>
              <p>El colaborador debe adjuntar una foto para que se acepte su registro.</p>
            </div>
            <mat-slide-toggle [(ngModel)]="policy.requirePhoto" color="primary" />
          </div>

          <div class="cfg-item">
            <div class="ci-ic"><mat-icon>fingerprint</mat-icon></div>
            <div class="ci-txt">
              <h4>Verificación biométrica obligatoria</h4>
              <p>Se exige huella o rostro del dispositivo antes de registrar.</p>
            </div>
            <mat-slide-toggle [(ngModel)]="policy.requireBiometric" color="primary" />
          </div>

          <div class="cfg-item">
            <div class="ci-ic"><mat-icon>smartphone</mat-icon></div>
            <div class="ci-txt">
              <h4>Validar dispositivo del colaborador</h4>
              <p>Solo se admiten dispositivos reconocidos previamente.</p>
            </div>
            <mat-slide-toggle [(ngModel)]="policy.deviceBindingEnabled" color="primary" />
          </div>

          @if (policy.deviceBindingEnabled) {
            <div class="cfg-item">
              <div class="ci-ic"><mat-icon>gpp_maybe</mat-icon></div>
              <div class="ci-txt">
                <h4>Ante un dispositivo desconocido</h4>
                <p>Rechazar bloquea el registro; marcar lo permite y lo deja señalado para revisión.</p>
              </div>
              <mat-button-toggle-group [(ngModel)]="policy.deviceBindingAction">
                <mat-button-toggle value="REJECT">Rechazar</mat-button-toggle>
                <mat-button-toggle value="FLAG">Marcar</mat-button-toggle>
              </mat-button-toggle-group>
            </div>
          }

          <div class="cfg-item">
            <div class="ci-ic"><mat-icon>my_location</mat-icon></div>
            <div class="ci-txt">
              <h4>Precisión GPS máxima por defecto (m)</h4>
              <p>Un registro con precisión peor que este umbral se rechaza. Entre 5 y 500 metros.</p>
            </div>
            <input class="inline-num" type="number" min="5" max="500" [(ngModel)]="policy.defaultGpsAccuracyMaxM" />
          </div>

          <div class="cfg-item">
            <div class="ci-ic"><mat-icon>travel_explore</mat-icon></div>
            <div class="ci-txt">
              <h4>Permitir registro sin centro de trabajo</h4>
              <p>
                Para personal sin sede fija. Se ficha con un QR de empresa: la ubicación se guarda pero
                <b>no se compara con ninguna geocerca</b>, y la foto pasa a ser obligatoria aunque esté
                desactivada arriba. El camino con centro sigue funcionando igual.
              </p>
            </div>
            <mat-slide-toggle [(ngModel)]="policy.sitelessAttendanceEnabled" color="primary" />
          </div>

          <div class="actions">
            <button mat-button type="button" [disabled]="savingPolicy()" (click)="loadPolicy()">Descartar</button>
            <button mat-flat-button color="primary" [disabled]="savingPolicy()" (click)="savePolicy()">
              <mat-icon>save</mat-icon> Guardar políticas
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
          <div class="card-head"><mat-icon>beach_access</mat-icon><h3>Vacaciones</h3></div>
          <p class="muted sub">Define cuántos días corresponden por cada año de antigüedad.</p>

          <!-- Escalera editable -->
          <div class="tier-head">
            <span>Año de antigüedad</span><span>Días</span><span></span>
          </div>
          @for (t of model.tiers; track $index) {
            <div class="tier-row">
              <div class="num"><input type="number" min="1" max="100" [(ngModel)]="t.year" /></div>
              <div class="num"><input type="number" min="0" max="366" [(ngModel)]="t.days" /></div>
              <button mat-icon-button type="button" (click)="removeTier($index)" [disabled]="model.tiers.length <= 1" aria-label="Quitar">
                <mat-icon>close</mat-icon>
              </button>
            </div>
          }
          <button mat-stroked-button type="button" class="add" (click)="addTier()">
            <mat-icon>add</mat-icon> Agregar tramo
          </button>

          <!-- Regla más allá del último tramo -->
          <div class="beyond">
            <div class="beyond-title">A partir del último año definido…</div>
            <mat-button-toggle-group [(ngModel)]="model.beyondMode" hideSingleSelectionIndicator>
              <mat-button-toggle value="FLAT">Se mantiene igual</mat-button-toggle>
              <mat-button-toggle value="INCREMENT">Sigue subiendo</mat-button-toggle>
            </mat-button-toggle-group>

            @if (model.beyondMode === 'INCREMENT') {
              <div class="inc">
                Sumar
                <input type="number" min="0" max="366" [(ngModel)]="model.beyondIncrementDays" class="inline-num" />
                días cada
                <input type="number" min="1" max="20" [(ngModel)]="model.beyondEveryYears" class="inline-num" />
                {{ model.beyondEveryYears === 1 ? 'año' : 'años' }}.
              </div>
            }
          </div>

          <div class="cfg-item">
            <div class="ci-ic"><mat-icon>verified_user</mat-icon></div>
            <div class="ci-txt">
              <h4>Requiere aprobación de supervisor</h4>
              <p>Si se desactiva, las solicitudes se aprueban automáticamente.</p>
            </div>
            <mat-slide-toggle [(ngModel)]="model.requireApproval" color="primary" />
          </div>
          <div class="cfg-item">
            <div class="ci-ic"><mat-icon>calendar_month</mat-icon></div>
            <div class="ci-txt">
              <h4>Contar solo días hábiles</h4>
              <p>Excluye sábados y domingos del conteo de días solicitados.</p>
            </div>
            <mat-slide-toggle [(ngModel)]="model.countBusinessDaysOnly" color="primary" />
          </div>

          <div class="actions">
            <button mat-button type="button" [disabled]="saving()" (click)="load()">Descartar</button>
            <button mat-flat-button color="primary" [disabled]="saving()" (click)="save()">
              <mat-icon>save</mat-icon> Guardar cambios
            </button>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card>
        <mat-card-content>
          <div class="info-box">
            <mat-icon>info</mat-icon>
            <div>La <b>fecha de ingreso</b> de cada colaborador (en su ficha) determina su antigüedad, y con esta escalera se calcula cuántos días de vacaciones le corresponden.</div>
          </div>
          <div class="preview">
            <div class="preview-title">Días por antigüedad (según lo configurado)</div>
            @for (y of previewYears(); track y) {
              <div class="preview-row"><span>{{ y }} {{ y === 1 ? 'año' : 'años' }}</span><b>{{ entitlement(y) }} días</b></div>
            }
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .cfg-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: var(--sp-4); align-items: start; }
      @media (max-width: 1000px) { .cfg-grid { grid-template-columns: 1fr; } }
      .card-head { display: flex; align-items: center; gap: 10px; }
      .card-head mat-icon { color: var(--brand); }
      .card-head h3 { margin: 0; font-size: 1.05rem; font-weight: 700; }
      .sub { margin: 4px 0 12px; font-size: var(--font-small); }
      .tier-head, .tier-row { display: grid; grid-template-columns: 1fr 1fr 44px; gap: var(--sp-3); align-items: center; }
      .tier-head { font-size: var(--font-caption); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); padding: 0 4px 6px; }
      .tier-row { padding: 4px 0; }
      .num input, .inline-num { border: 1px solid var(--border-strong); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; padding: 9px 10px; width: 100%; text-align: center; font-weight: 600; }
      .num input:focus, .inline-num:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
      .add { margin-top: var(--sp-2); }
      .beyond { margin: var(--sp-4) 0; padding: var(--sp-4); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-2); }
      .beyond-title { font-size: var(--font-small); font-weight: 600; margin-bottom: var(--sp-2); }
      .inc { margin-top: var(--sp-3); font-size: var(--font-body); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .inline-num { width: 64px; }
      .policy-card { margin-bottom: var(--sp-4); }
      .cfg-item { display: flex; align-items: center; gap: var(--sp-4); padding: var(--sp-4) 0; border-top: 1px solid var(--border); }
      .ci-ic { width: 40px; height: 40px; border-radius: 11px; background: var(--brand-soft); border: 1px solid var(--brand-border); color: var(--brand); display: grid; place-items: center; flex: none; }
      .ci-txt { flex: 1; }
      .ci-txt h4 { margin: 0; font-size: var(--font-body); font-weight: 600; }
      .ci-txt p { margin: 3px 0 0; font-size: var(--font-small); color: var(--text-muted); }
      .actions { margin-top: var(--sp-4); display: flex; justify-content: flex-end; gap: var(--sp-2); }
      .info-box { display: flex; gap: 11px; padding: 4px; color: var(--text); font-size: var(--font-small); line-height: 1.5; }
      .info-box mat-icon { color: var(--info); flex: none; }
      .preview { margin-top: var(--sp-4); border-top: 1px solid var(--border); padding-top: var(--sp-3); }
      .preview-title { font-size: var(--font-small); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); margin-bottom: var(--sp-2); }
      .preview-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: var(--font-body); }
    `,
  ],
})
export class SettingsComponent {
  private readonly service = inject(VacationPolicyService);
  private readonly policyService = inject(CompanyPolicyService);
  private readonly auth = inject(AuthStore);
  private readonly notify = inject(NotificationService);

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
        this.policyError.set('No se pudieron cargar las políticas de registro.');
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
        this.notify.success('Políticas de registro guardadas.');
      },
      error: () => {
        this.savingPolicy.set(false);
        this.notify.error('No se pudieron guardar las políticas. Revisa la precisión GPS (entre 5 y 500 m).');
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
        this.error.set('No se pudo cargar la configuración de vacaciones.');
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
        this.notify.success('Configuración guardada.');
      },
      error: () => {
        this.saving.set(false);
        this.notify.error('No se pudieron guardar los cambios. Revisa que no haya años repetidos.');
      },
    });
  }
}
