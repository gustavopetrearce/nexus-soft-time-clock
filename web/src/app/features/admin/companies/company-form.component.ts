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
  ],
  template: `
    <app-breadcrumb
      [items]="[
        { label: 'Organización', route: '/companies' },
        { label: 'Empresas', route: '/companies' },
        { label: isEdit() ? (company()?.name ?? '') : 'Nueva empresa' },
      ]"
    />
    <app-page-header [title]="isEdit() ? 'Editar empresa' : 'Nueva empresa'" />

    @if (loading()) { <mat-progress-bar mode="indeterminate" style="margin-bottom:16px" /> }
    @if (error()) { <p class="error-text">{{ error() }}</p> }

    <div class="form-page-layout">
      <div class="form-page-main">
        <h3 class="form-section-title">Información de la empresa</h3>
        <form [formGroup]="form">
          <div class="form-grid-2">
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>Código</mat-label>
              <input matInput formControlName="code" />
              <mat-hint>Código único que identifica a la empresa en el sistema.</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>Nombre comercial</mat-label>
              <input matInput formControlName="name" />
              <mat-hint>Nombre con el que se identifica la empresa.</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>Razón social</mat-label>
              <input matInput formControlName="legalName" />
              <mat-hint>Nombre legal de la empresa (opcional).</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>Dominio de correo</mat-label>
              <input matInput formControlName="emailDomain" placeholder="empresa.com" />
              <mat-hint>Dominio utilizado para accesos y validaciones (opcional).</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>Zona horaria</mat-label>
              <mat-select formControlName="timezone">
                @for (tz of tzOptions(); track tz.value) {
                  <mat-option [value]="tz.value">{{ tz.label }}</mat-option>
                }
              </mat-select>
              <mat-hint>Zona horaria principal de la empresa.</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="drawer-field">
              <mat-label>Idioma</mat-label>
              <mat-select formControlName="locale">
                @for (loc of localeOpts(); track loc.value) {
                  <mat-option [value]="loc.value">{{ loc.label }}</mat-option>
                }
              </mat-select>
              <mat-hint>Idioma predeterminado de la empresa.</mat-hint>
            </mat-form-field>
          </div>
        </form>

        @if (!isEdit()) {
          <h3 class="form-section-title" style="margin-top: var(--sp-6)">Administrador inicial</h3>
          <p class="muted" style="margin: 0 0 var(--sp-4)">
            Se creará el primer usuario COMPANY_ADMIN de la empresa. Podrá iniciar sesión con estos datos y administrar su tenant.
          </p>
          <form [formGroup]="adminForm">
            <div class="form-grid-2">
              <mat-form-field appearance="outline" class="drawer-field">
                <mat-label>Email</mat-label>
                <input matInput type="email" formControlName="email" placeholder="admin@empresa.com" />
                <mat-hint>Correo de acceso del administrador.</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" class="drawer-field">
                <mat-label>Contraseña temporal</mat-label>
                <input matInput type="password" formControlName="password" />
                <mat-hint>Mínimo 8 caracteres. Podrá cambiarla luego.</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" class="drawer-field">
                <mat-label>Nombre</mat-label>
                <input matInput formControlName="firstName" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="drawer-field">
                <mat-label>Apellido</mat-label>
                <input matInput formControlName="lastName" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="drawer-field">
                <mat-label>Código de empleado</mat-label>
                <input matInput formControlName="employeeCode" />
                <mat-hint>Opcional.</mat-hint>
              </mat-form-field>
            </div>
          </form>
        }

        <div class="form-callout">
          <mat-icon>info</mat-icon>
          <div>
            <p class="row-title">Importante</p>
            <p class="row-desc">Una vez creada la empresa, podrás administrar sus centros de trabajo, proyectos y horarios.</p>
          </div>
        </div>

        <div class="form-actions">
          <button mat-button type="button" (click)="cancel()">Cancelar</button>
          <button mat-flat-button color="primary" [disabled]="!canSave() || saving()" (click)="save()">
            <mat-icon>save</mat-icon> {{ isEdit() ? 'Guardar cambios' : 'Guardar empresa' }}
          </button>
        </div>
      </div>

      <div class="form-page-side">
        <div class="info-card tip">
          <h3 class="info-card-title">Información importante</h3>
          <div class="icon-row">
            <mat-icon>shield</mat-icon>
            <div>
              <p class="row-title">Código único</p>
              <p class="row-desc">El código de empresa no puede modificarse después de crearla.</p>
            </div>
          </div>
          <div class="icon-row">
            <mat-icon>public</mat-icon>
            <div>
              <p class="row-title">Zona horaria y locale</p>
              <p class="row-desc">Afectan los cálculos de asistencia y reportes.</p>
            </div>
          </div>
          <div class="icon-row">
            <mat-icon>check_circle</mat-icon>
            <div>
              <p class="row-title">Solo empresas activas</p>
              <p class="row-desc">Solo las empresas activas pueden tener usuarios y centros de trabajo.</p>
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
            <div class="info-row"><span class="k">Código</span><span class="v">{{ c.code }}</span></div>
          </div>
          <div class="info-card">
            <h3 class="info-card-title">Estado de la empresa</h3>
            <p class="muted" style="margin:0 0 var(--sp-3)">
              @if (c.status === 'ACTIVE') { Solo las empresas activas pueden usar el sistema. }
              @else { Esta empresa no puede operar mientras no esté activa. }
            </p>
            <button mat-stroked-button (click)="toggleStatus(c)">
              {{ c.status === 'ACTIVE' ? 'Suspender empresa' : 'Activar empresa' }}
            </button>
          </div>

          <div class="info-card">
            <h3 class="info-card-title">Administrador</h3>
            @if (!showAdminForm()) {
              <p class="muted" style="margin:0 0 var(--sp-3)">
                Aprovisioná un usuario COMPANY_ADMIN para esta empresa (el primer acceso del tenant).
              </p>
              <button mat-stroked-button (click)="showAdminForm.set(true)">
                <mat-icon>person_add</mat-icon> Agregar administrador
              </button>
            } @else {
              <form [formGroup]="adminForm">
                <mat-form-field appearance="outline" class="drawer-field" style="width:100%">
                  <mat-label>Email</mat-label>
                  <input matInput type="email" formControlName="email" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="drawer-field" style="width:100%">
                  <mat-label>Nombre</mat-label>
                  <input matInput formControlName="firstName" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="drawer-field" style="width:100%">
                  <mat-label>Apellido</mat-label>
                  <input matInput formControlName="lastName" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="drawer-field" style="width:100%">
                  <mat-label>Contraseña temporal</mat-label>
                  <input matInput type="password" formControlName="password" />
                  <mat-hint>Mínimo 8 caracteres.</mat-hint>
                </mat-form-field>
              </form>
              <div style="display:flex; gap: var(--sp-2); margin-top: var(--sp-2)">
                <button mat-flat-button color="primary" [disabled]="!adminValid() || provisioningAdmin()" (click)="provisionAdmin()">
                  <mat-icon>save</mat-icon> Guardar administrador
                </button>
                <button mat-button (click)="showAdminForm.set(false)">Cancelar</button>
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
          this.error.set('No se pudo cargar la empresa.');
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
          this.notify.success('Empresa actualizada.');
          void this.router.navigate(['/companies']);
        },
        error: () => {
          this.saving.set(false);
          this.notify.error('No se pudo guardar la empresa.');
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
        this.notify.error('No se pudo crear la empresa.');
      },
    });
  }

  /** Aprovisiona el COMPANY_ADMIN de la empresa recién creada. */
  private provisionInitialAdmin(companyId: string): void {
    this.service.provisionAdmin(companyId, this.adminPayload()).subscribe({
      next: () => {
        this.notify.success('Empresa creada y administrador aprovisionado.');
        void this.router.navigate(['/companies']);
      },
      error: () => {
        this.saving.set(false);
        this.notify.error(
          'La empresa se creó, pero no se pudo aprovisionar el administrador. Reintentá desde la ficha de la empresa.',
        );
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
        this.notify.success('Administrador aprovisionado.');
        this.adminForm.reset();
        this.showAdminForm.set(false);
        this.provisioningAdmin.set(false);
      },
      error: () => {
        this.provisioningAdmin.set(false);
        this.notify.error('No se pudo aprovisionar el administrador.');
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
          title: next === 'SUSPENDED' ? 'Suspender empresa' : 'Activar empresa',
          message: `¿Confirmás cambiar el estado de "${company.name}" a ${next}?`,
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
            this.notify.success('Estado actualizado.');
          },
          error: () => this.notify.error('No se pudo cambiar el estado.'),
        });
      });
  }
}
