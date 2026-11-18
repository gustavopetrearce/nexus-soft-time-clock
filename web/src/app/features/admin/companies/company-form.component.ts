import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Observable, of, switchMap } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { ConfirmDialogComponent } from '../../../core/ui/confirm-dialog.component';
import { EmptyStateComponent } from '../../../core/ui/empty-state.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { ScrollDirective } from '../../../core/ui/scroll.directive';
import { NotificationService } from '../../../core/ui/notification.service';
import { localeOptions } from '../../../core/models/locales';
import { browserTimeZone, timezoneOptions } from '../../../core/models/timezones';
import { CapacityDialogComponent } from './capacity-dialog.component';
import { Company, CompanyStatus } from './company.models';
import { CompanyService } from './company.service';

export interface CompanyDrawerData {
  /** Empresa a editar; sin ella, se crea una nueva. */
  companyId: string | null;
}

/**
 * P23 · Nueva o editar empresa (Drawer sobre P22, HIFI/03 F): código y nombre obligatorios, razón
 * social, dominio, zona horaria, idioma y, al editar, estado (suspender se confirma, S01), en una
 * columna; «Cupo de colaboradores» (P24) solo al editar. Al crear se aprovisiona además el
 * administrador inicial; al editar puede agregarse otro bajo demanda. Guardar cierra y avisa.
 */
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
    MatSelectModule,
    TranslocoPipe,
    EmptyStateComponent,
    LoadingBarComponent,
    ScrollDirective,
  ],
  styles: [
    `
      h2, h3, p { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      form { display: flex; flex-direction: column; gap: var(--nx-space-gap-related); }
      .solo { align-self: flex-start; }
      .nx-fila-botones { display: flex; justify-content: flex-end; gap: var(--nx-space-gap-inline); }
      .nx-capa__pie .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
    `,
  ],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3" mat-dialog-title>{{ (isEdit() ? 'companies.edit' : 'companies.new') | transloco }}</h2>
      <button mat-icon-button type="button" mat-dialog-close [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
    </div>
    <div class="nx-capa__cuerpo nx-scroll" nxScroll aria-live="polite">
      <app-loading-bar [active]="loading()" />

      @if (error()) {
        <app-empty-state tone="error" [message]="'common.loadError' | transloco" [description]="'common.loadErrorHint' | transloco" />
      } @else {
        <form id="empresa" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="nx-form__grid nx-form__grid--1">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'common.code' | transloco }}</mat-label>
              <input matInput formControlName="code" required autocomplete="off" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'common.name' | transloco }}</mat-label>
              <input matInput formControlName="name" required autocomplete="off" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'companies.form.legalName' | transloco }}</mat-label>
              <input matInput formControlName="legalName" autocomplete="off" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'companies.form.emailDomain' | transloco }}</mat-label>
              <input matInput formControlName="emailDomain" placeholder="empresa.com" autocomplete="off" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'companies.form.timezone' | transloco }}</mat-label>
              <mat-select formControlName="timezone">
                @for (tz of tzOptions(); track tz.value) { <mat-option [value]="tz.value">{{ tz.label }}</mat-option> }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'companies.form.locale' | transloco }}</mat-label>
              <mat-select formControlName="locale">
                @for (loc of localeOpts(); track loc.value) { <mat-option [value]="loc.value">{{ loc.label }}</mat-option> }
              </mat-select>
            </mat-form-field>
            @if (isEdit()) {
              <mat-form-field appearance="outline">
                <mat-label>{{ 'common.status' | transloco }}</mat-label>
                <mat-select [formControl]="statusControl">
                  @for (s of statuses; track s) { <mat-option [value]="s">{{ 'companies.status.' + s | transloco }}</mat-option> }
                </mat-select>
              </mat-form-field>
            }
          </div>

          @if (isEdit() && canManageCapacity()) {
            <button mat-stroked-button type="button" class="solo" (click)="openCapacity()"><mat-icon>group</mat-icon>{{ 'capacity.title' | transloco }}</button>
          }

          <!-- Al crear se aprovisiona también el administrador inicial (COMPANY_ADMIN). -->
          @if (!isEdit() || showAdminForm()) {
            <h3 class="nx-text-heading-4 nx-form__seccion">{{ 'companies.form.initialAdmin' | transloco }}</h3>
            <div class="nx-form__grid nx-form__grid--1" [formGroup]="adminForm">
              <mat-form-field appearance="outline">
                <mat-label>{{ 'common.email' | transloco }}</mat-label>
                <input matInput type="email" formControlName="email" required autocomplete="off" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'common.tempPassword' | transloco }}</mat-label>
                <input matInput type="password" formControlName="password" required autocomplete="new-password" />
                <mat-hint>{{ 'common.minPassword' | transloco }}</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'common.firstName' | transloco }}</mat-label>
                <input matInput formControlName="firstName" required autocomplete="off" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'users.form.lastNames' | transloco }}</mat-label>
                <input matInput formControlName="lastName" required autocomplete="off" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>{{ 'users.form.employeeCodeOptional' | transloco }}</mat-label>
                <input matInput formControlName="employeeCode" autocomplete="off" />
              </mat-form-field>
            </div>
            @if (isEdit()) {
              <div class="nx-fila-botones">
                <button mat-button type="button" (click)="showAdminForm.set(false)">{{ 'common.cancel' | transloco }}</button>
                <button mat-stroked-button type="button" [disabled]="!adminValid() || provisioningAdmin()" (click)="provisionAdmin()">{{ 'companies.form.saveAdmin' | transloco }}</button>
              </div>
            }
          } @else {
            <button mat-button type="button" class="solo" (click)="showAdminForm.set(true)"><mat-icon>person_add</mat-icon>{{ 'companies.form.addAdmin' | transloco }}</button>
          }

        </form>
      }
    </div>
    <div class="nx-capa__pie">
      <button mat-button type="button" mat-dialog-close><mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button type="submit" form="empresa" [disabled]="saving()" [attr.aria-busy]="saving()">
        @if (saving()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>save</mat-icon> }
        {{ 'common.save' | transloco }}
      </button>
    </div>
  `,
})
export class CompanyFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly data = inject<CompanyDrawerData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<CompanyFormComponent, boolean>>(MatDialogRef);
  private readonly service = inject(CompanyService);
  private readonly notify = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);
  private readonly auth = inject(AuthStore);

  protected readonly statuses: CompanyStatus[] = ['ACTIVE', 'SUSPENDED'];
  protected readonly statusControl = this.fb.nonNullable.control<CompanyStatus>('ACTIVE');

  protected readonly companyId = this.data.companyId;
  protected readonly isEdit = computed(() => !!this.companyId);

  protected readonly company = signal<Company | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal(false);

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
          this.statusControl.setValue(c.status);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
    }
  }

  protected canManageCapacity(): boolean {
    return this.auth.hasPermission('company:capacity');
  }

  protected openCapacity(): void {
    const company = this.company();
    if (company) this.dialog.open(CapacityDialogComponent, { data: { company } });
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
        this.form.markAllAsTouched();
        return;
      }
      const id = this.companyId;
      const nextStatus = this.statusControl.value;
      const statusChanged = nextStatus !== this.company()?.status;
      const run = () => {
        this.saving.set(true);
        const status$: Observable<unknown> = statusChanged ? this.service.setStatus(id, nextStatus) : of(null);
        this.service
          .update(id, payload)
          .pipe(switchMap(() => status$))
          .subscribe({
            next: () => {
              this.notify.success(this.transloco.translate('companies.form.updated'));
              this.ref.close(true);
            },
            error: () => {
              this.saving.set(false);
              this.notify.error(this.transloco.translate('companies.form.saveError'));
            },
          });
      };
      if (statusChanged && nextStatus === 'SUSPENDED') {
        this.dialog
          .open(ConfirmDialogComponent, {
            data: {
              title: this.transloco.translate('companies.suspend'),
              message: this.transloco.translate('companies.confirmStatus', {
                name: raw.name,
                status: this.transloco.translate('companies.status.SUSPENDED'),
              }),
              confirmText: this.transloco.translate('companies.suspend'),
              color: 'warn',
            },
          })
          .afterClosed()
          .subscribe((confirmed) => (confirmed ? run() : this.statusControl.setValue(this.company()!.status)));
      } else {
        run();
      }
      return;
    }

    // Alta: se crea la empresa y, a continuación, su administrador inicial.
    if (this.form.invalid || this.adminForm.invalid) {
      this.form.markAllAsTouched();
      this.adminForm.markAllAsTouched();
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
        this.ref.close(true);
      },
      error: () => {
        this.saving.set(false);
        this.notify.error(this.transloco.translate('companies.form.createdNoAdmin'));
        this.ref.close(true);
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
}
