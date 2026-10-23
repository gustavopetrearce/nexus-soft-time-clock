import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { BreadcrumbComponent } from '../../../core/ui/breadcrumb.component';
import { ConfirmDialogComponent } from '../../../core/ui/confirm-dialog.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { PageHeaderComponent } from '../../../core/ui/page-header.component';
import { StatusChipComponent } from '../../../core/ui/status-chip.component';
import { localeOptions } from '../../../core/models/locales';
import { browserTimeZone, timezoneOptions } from '../../../core/models/timezones';
import { Company } from './company.models';
import { CompanyService } from './company.service';

/** Alta / edición de empresa en página completa (con breadcrumb), fiel al patrón "Formulario". */
@Component({
  selector: 'app-company-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    BreadcrumbComponent,
    PageHeaderComponent,
    StatusChipComponent,
    TranslocoPipe,
  ],
  template: `
    <app-breadcrumb
      [items]="[
        { label: ('layout.group.organization' | transloco), route: '/companies' },
        { label: ('companies.title' | transloco), route: '/companies' },
        { label: isEdit() ? (company()?.name ?? '') : ('companies.new' | transloco) },
      ]"
    />
    <app-page-header [title]="(isEdit() ? 'companies.edit' : 'companies.new') | transloco" />

    @if (loading()) { <mat-progress-bar mode="indeterminate" style="margin-bottom:16px" /> }
    @if (error()) { <p class="error-text">{{ error() }}</p> }

    <div class="form-page-layout">
      <div class="form-page-main">
        <h3 class="form-section-title">{{ 'companies.form.info' | transloco }}</h3>
        <form [formGroup]="form">
          <div class="form-grid-2">
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>{{ 'common.code' | transloco }}</mat-label>
              <input matInput formControlName="code" />
              <mat-hint>{{ 'companies.form.codeHint' | transloco }}</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>{{ 'companies.form.tradeName' | transloco }}</mat-label>
              <input matInput formControlName="name" />
              <mat-hint>{{ 'companies.form.tradeNameHint' | transloco }}</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>{{ 'companies.form.legalName' | transloco }}</mat-label>
              <input matInput formControlName="legalName" />
              <mat-hint>{{ 'companies.form.legalNameHint' | transloco }}</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>{{ 'companies.form.emailDomain' | transloco }}</mat-label>
              <input matInput formControlName="emailDomain" placeholder="empresa.com" />
              <mat-hint>{{ 'companies.form.emailDomainHint' | transloco }}</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>{{ 'companies.form.timezone' | transloco }}</mat-label>
              <mat-select formControlName="timezone">
                @for (tz of tzOptions(); track tz.value) {
                  <mat-option [value]="tz.value">{{ tz.label }}</mat-option>
                }
              </mat-select>
              <mat-hint>{{ 'companies.form.timezoneHint' | transloco }}</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>{{ 'companies.form.locale' | transloco }}</mat-label>
              <mat-select formControlName="locale">
                @for (loc of localeOpts(); track loc.value) {
                  <mat-option [value]="loc.value">{{ loc.label }}</mat-option>
                }
              </mat-select>
              <mat-hint>{{ 'companies.form.localeHint' | transloco }}</mat-hint>
            </mat-form-field>
          </div>
        </form>

        @if (!isEdit()) {
          <h3 class="form-section-title" style="margin-top: var(--sp-6)">{{ 'companies.form.initialAdmin' | transloco }}</h3>
          <p class="muted" style="margin: 0 0 var(--sp-4)">
            {{ 'companies.form.initialAdminText' | transloco }}
          </p>
          <form [formGroup]="adminForm">
            <div class="form-grid-2">
              <mat-form-field appearance="outline" class="drawer-field">
                <mat-label>{{ 'common.email' | transloco }}</mat-label>
                <input matInput type="email" formControlName="email" placeholder="admin@empresa.com" />
                <mat-hint>{{ 'companies.form.adminEmailHint' | transloco }}</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" class="drawer-field">
                <mat-label>{{ 'common.tempPassword' | transloco }}</mat-label>
                <input matInput type="password" formControlName="password" />
                <mat-hint>{{ 'companies.form.tempPasswordHint' | transloco }}</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" class="drawer-field">
                <mat-label>{{ 'common.firstName' | transloco }}</mat-label>
                <input matInput formControlName="firstName" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="drawer-field">
                <mat-label>{{ 'common.lastName' | transloco }}</mat-label>
                <input matInput formControlName="lastName" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="drawer-field">
                <mat-label>{{ 'common.employeeCode' | transloco }}</mat-label>
                <input matInput formControlName="employeeCode" />
                <mat-hint>{{ 'common.optional' | transloco }}</mat-hint>
              </mat-form-field>
            </div>
          </form>
        }

        <div class="form-callout">
          <mat-icon>info</mat-icon>
          <div>
            <p class="row-title">{{ 'companies.form.important' | transloco }}</p>
            <p class="row-desc">{{ 'companies.form.importantText' | transloco }}</p>
          </div>
        </div>

        <div class="form-actions">
          <button mat-button type="button" (click)="cancel()">{{ 'common.cancel' | transloco }}</button>
          <button mat-flat-button color="primary" [disabled]="!canSave() || saving()" (click)="save()">
            <mat-icon>save</mat-icon> {{ (isEdit() ? 'common.saveChanges' : 'companies.form.save') | transloco }}
          </button>
        </div>
      </div>

      <div class="form-page-side">
        <div class="info-card tip">
          <h3 class="info-card-title">{{ 'companies.form.importantInfo' | transloco }}</h3>
          <div class="icon-row">
            <mat-icon>shield</mat-icon>
            <div>
              <p class="row-title">{{ 'companies.form.uniqueCode' | transloco }}</p>
              <p class="row-desc">{{ 'companies.form.uniqueCodeText' | transloco }}</p>
            </div>
          </div>
          <div class="icon-row">
            <mat-icon>public</mat-icon>
            <div>
              <p class="row-title">{{ 'companies.form.tzLocale' | transloco }}</p>
              <p class="row-desc">{{ 'companies.form.tzLocaleText' | transloco }}</p>
            </div>
          </div>
          <div class="icon-row">
            <mat-icon>check_circle</mat-icon>
            <div>
              <p class="row-title">{{ 'companies.form.activeOnly' | transloco }}</p>
              <p class="row-desc">{{ 'companies.form.activeOnlyText' | transloco }}</p>
            </div>
          </div>
        </div>

        @if (isEdit() && company(); as c) {
          <div class="info-card">
            <div class="entity-avatar-row">
              <div class="entity-avatar">{{ initials(c.name) }}</div>
              <div>
                <p class="entity-avatar-name">{{ c.name }}</p>
                <app-status-chip [status]="c.status" />
              </div>
            </div>
            <div class="info-row"><span class="k">{{ 'common.code' | transloco }}</span><span class="v">{{ c.code }}</span></div>
          </div>
          <div class="info-card">
            <h3 class="info-card-title">{{ 'companies.form.statusTitle' | transloco }}</h3>
            <p class="muted" style="margin:0 0 var(--sp-3)">
              {{ (c.status === 'ACTIVE' ? 'companies.form.statusActiveText' : 'companies.form.statusInactiveText') | transloco }}
            </p>
            <button mat-stroked-button (click)="toggleStatus(c)">
              {{ (c.status === 'ACTIVE' ? 'companies.suspend' : 'companies.activate') | transloco }}
            </button>
          </div>

          <div class="info-card">
            <h3 class="info-card-title">{{ 'companies.form.admin' | transloco }}</h3>
            @if (!showAdminForm()) {
              <p class="muted" style="margin:0 0 var(--sp-3)">
                {{ 'companies.form.adminText' | transloco }}
              </p>
              <button mat-stroked-button (click)="showAdminForm.set(true)">
                <mat-icon>person_add</mat-icon> {{ 'companies.form.addAdmin' | transloco }}
              </button>
            } @else {
              <form [formGroup]="adminForm">
                <mat-form-field appearance="outline" class="drawer-field" style="width:100%">
                  <mat-label>{{ 'common.email' | transloco }}</mat-label>
                  <input matInput type="email" formControlName="email" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="drawer-field" style="width:100%">
                  <mat-label>{{ 'common.firstName' | transloco }}</mat-label>
                  <input matInput formControlName="firstName" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="drawer-field" style="width:100%">
                  <mat-label>{{ 'common.lastName' | transloco }}</mat-label>
                  <input matInput formControlName="lastName" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="drawer-field" style="width:100%">
                  <mat-label>{{ 'common.tempPassword' | transloco }}</mat-label>
                  <input matInput type="password" formControlName="password" />
                  <mat-hint>{{ 'common.minPassword' | transloco }}</mat-hint>
                </mat-form-field>
              </form>
              <div style="display:flex; gap: var(--sp-2); margin-top: var(--sp-2)">
                <button mat-flat-button color="primary" [disabled]="!adminValid() || provisioningAdmin()" (click)="provisionAdmin()">
                  <mat-icon>save</mat-icon> {{ 'companies.form.saveAdmin' | transloco }}
                </button>
                <button mat-button (click)="showAdminForm.set(false)">{{ 'common.cancel' | transloco }}</button>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class CompanyFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(CompanyService);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly companyId = this.route.snapshot.paramMap.get('id');
  protected readonly isEdit = computed(() => !!this.companyId);

  protected readonly company = signal<Company | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** La lista es curada; si la empresa guarda una zona fuera de ella se añade para no perderla. */
  protected readonly tzOptions = computed(() => timezoneOptions(this.company()?.timezone));

  /** Igual que la zona: un idioma guardado fuera de la lista se conserva en vez de borrarse. */
  protected readonly localeOpts = computed(() => localeOptions(this.company()?.locale));

  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required]],
    name: ['', [Validators.required]],
    legalName: [''],
    emailDomain: [''],
    timezone: [browserTimeZone(), [Validators.required]],
    locale: ['es', [Validators.required]],
  });

  /** Datos del administrador inicial (COMPANY_ADMIN). Requerido al crear; opcional (bajo demanda) al editar. */
  protected readonly adminForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]],
    employeeCode: [''],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected readonly showAdminForm = signal(false);
  protected readonly provisioningAdmin = signal(false);

  private readonly formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  protected readonly formValid = computed(() => this.formStatus() === 'VALID');

  private readonly adminStatus = toSignal(this.adminForm.statusChanges, { initialValue: this.adminForm.status });
  protected readonly adminValid = computed(() => this.adminStatus() === 'VALID');

  /** Al crear se exige también el administrador inicial; al editar, solo los datos de la empresa. */
  protected readonly canSave = computed(() => this.formValid() && (this.isEdit() || this.adminValid()));

  constructor() {
    if (this.companyId) {
      this.loading.set(true);
      this.service.get(this.companyId).subscribe({
        next: (c) => {
          this.company.set(c);
          this.form.reset({
            code: c.code,
            name: c.name,
            legalName: c.legalName ?? '',
            emailDomain: c.emailDomain ?? '',
            timezone: c.timezone || browserTimeZone(),
            locale: c.locale || 'es',
          });
          this.form.controls.code.disable();
          this.loading.set(false);
        },
        error: () => {
          this.error.set(this.transloco.translate('companies.form.loadError'));
          this.loading.set(false);
        },
      });
    }
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p.charAt(0)).join('').toUpperCase();
  }

  protected cancel(): void {
    void this.router.navigate(['/companies']);
  }

  protected save(): void {
    const raw = this.form.getRawValue();
    const payload = {
      name: raw.name,
      legalName: raw.legalName || undefined,
      emailDomain: raw.emailDomain || undefined,
      timezone: raw.timezone || undefined,
      locale: raw.locale || undefined,
    };

    if (this.companyId) {
      if (this.form.invalid) {
        return;
      }
      this.saving.set(true);
      this.service.update(this.companyId, payload).subscribe({
        next: () => {
          this.notify.success(this.transloco.translate('companies.form.updated'));
          void this.router.navigate(['/companies']);
        },
        error: () => {
          this.saving.set(false);
          this.notify.error(this.transloco.translate('companies.form.saveError'));
        },
      });
      return;
    }

    // Alta: se crea la empresa y, a continuación, su administrador inicial.
    if (this.form.invalid || this.adminForm.invalid) {
      return;
    }
    this.saving.set(true);
    this.service.create({ code: raw.code, ...payload }).subscribe({
      next: (company) => this.provisionInitialAdmin(company.id),
      error: () => {
        this.saving.set(false);
        this.notify.error(this.transloco.translate('companies.form.createError'));
      },
    });
  }

  /** Aprovisiona el COMPANY_ADMIN de la empresa recién creada. */
  private provisionInitialAdmin(companyId: string): void {
    this.service.provisionAdmin(companyId, this.adminPayload()).subscribe({
      next: () => {
        this.notify.success(this.transloco.translate('companies.form.created'));
        void this.router.navigate(['/companies']);
      },
      error: () => {
        this.saving.set(false);
        this.notify.error(this.transloco.translate('companies.form.createdNoAdmin'));
        void this.router.navigate(['/companies', companyId, 'edit']);
      },
    });
  }

  /** Aprovisiona un administrador desde la ficha de la empresa (modo edición / recuperación). */
  protected provisionAdmin(): void {
    if (this.adminForm.invalid || !this.companyId) {
      return;
    }
    this.provisioningAdmin.set(true);
    this.service.provisionAdmin(this.companyId, this.adminPayload()).subscribe({
      next: () => {
        this.notify.success(this.transloco.translate('companies.form.adminProvisioned'));
        this.adminForm.reset();
        this.showAdminForm.set(false);
        this.provisioningAdmin.set(false);
      },
      error: () => {
        this.provisioningAdmin.set(false);
        this.notify.error(this.transloco.translate('companies.form.adminError'));
      },
    });
  }

  private adminPayload() {
    const a = this.adminForm.getRawValue();
    return {
      email: a.email,
      firstName: a.firstName,
      lastName: a.lastName,
      password: a.password,
      employeeCode: a.employeeCode || undefined,
    };
  }

  protected toggleStatus(company: Company): void {
    const next = company.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: this.transloco.translate(next === 'SUSPENDED' ? 'companies.suspend' : 'companies.activate'),
          message: this.transloco.translate('companies.confirmStatus', {
            name: company.name,
            status: this.transloco.translate(`status.${next}`),
          }),
          color: next === 'SUSPENDED' ? 'warn' : 'primary',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }
        this.service.setStatus(company.id, next).subscribe({
          next: (updated) => {
            this.company.set(updated);
            this.notify.success(this.transloco.translate('common.statusUpdated'));
          },
          error: () => this.notify.error(this.transloco.translate('common.statusError')),
        });
      });
  }
}
