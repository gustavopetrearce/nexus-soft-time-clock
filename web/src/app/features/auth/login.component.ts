import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';

import { AuthService } from '../../core/auth/auth.service';
import { LanguageSwitcherComponent } from '../../core/i18n/language-switcher.component';
import { problemCode } from '../../core/ui/problem-detail';
import { AlertComponent } from '../../core/ui/alert.component';
import { LogoComponent } from '../../core/ui/logo.component';

/** Aviso del formulario: credenciales inválidas (401, genérico), cuenta bloqueada (RN-40) o sin conexión. */
type LoginError = 'invalid' | 'locked' | 'offline';

/**
 * P11 · Login del portal (RF-01). Estructura A: panel de marca (IDENT/07, oculto por debajo de
 * breakpoint-md) y formulario. El 401 muestra un aviso genérico que no revela qué dato falló;
 * la cuenta bloqueada (423 / ACCOUNT_LOCKED) su propio aviso.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    TranslocoPipe,
    AlertComponent,
    LanguageSwitcherComponent,
    LogoComponent,
  ],
  styles: [
    `
      :host { display: block; min-height: 100vh; padding: var(--nx-space-5); background: var(--nx-color-bg-app); box-sizing: border-box; }
      .nx-acceso {
        min-height: calc(100vh - 2 * var(--nx-space-5));
        border: var(--nx-border-width-default) solid var(--nx-color-border-default);
        border-radius: var(--nx-radius-lg);
        box-shadow: var(--nx-shadow-1);
        overflow: hidden;
      }
      .nx-acceso__lado { position: relative; }
      .idioma { position: absolute; top: var(--nx-space-4); right: var(--nx-space-4); }
      h1, p { margin: var(--nx-space-0); }
      mat-form-field { width: 100%; }
      .enviar .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
      .cabecera { display: flex; flex-direction: column; align-items: center; gap: var(--nx-space-gap-related); text-align: center; }
      .nx-campo__label > span { color: var(--nx-color-status-error-fg); }
      .pie {
        padding-top: var(--nx-space-4);
        border-top: var(--nx-border-width-default) solid var(--nx-color-border-default);
        color: var(--nx-color-text-secondary);
        text-align: center;
      }
    `,
  ],
  template: `
    <div class="nx-acceso">
      <section class="nx-acceso__marca" aria-hidden="true">
        <div class="nx-reticula"></div>
        <svg class="nx-arte" viewBox="0 0 400 400">
          <circle cx="210" cy="210" r="160" stroke="currentColor" stroke-opacity=".12" stroke-width="1.5" fill="none" />
          <circle cx="210" cy="210" r="120" stroke="currentColor" stroke-opacity=".18" stroke-width="1.5" fill="none" />
          <line x1="210" y1="210" x2="90" y2="130" stroke="currentColor" stroke-opacity=".16" />
          <line x1="210" y1="210" x2="360" y2="150" stroke="currentColor" stroke-opacity=".16" />
          <line x1="210" y1="210" x2="120" y2="340" stroke="currentColor" stroke-opacity=".16" />
          <line x1="210" y1="210" x2="210" y2="90" stroke="currentColor" stroke-opacity=".4" stroke-width="3" stroke-linecap="round" />
          <line x1="210" y1="210" x2="270" y2="240" stroke="currentColor" stroke-opacity=".6" stroke-width="3" stroke-linecap="round" />
          <circle cx="210" cy="210" r="5" fill="currentColor" />
          <circle cx="90" cy="130" r="5" fill="currentColor" fill-opacity=".6" />
          <circle cx="360" cy="150" r="4" fill="currentColor" fill-opacity=".45" />
          <circle cx="120" cy="340" r="4" fill="currentColor" fill-opacity=".45" />
          <circle cx="330" cy="330" r="3" fill="currentColor" fill-opacity=".3" />
        </svg>
        <span class="nx-lockup"><app-logo class="md" /><span class="nx-lockup__name">Nexus Soft Time Clock</span></span>
        <p class="nx-text-heading-1">{{ 'login.tagline' | transloco }}</p>
      </section>

      <div class="nx-acceso__lado">
        <app-language-switcher class="idioma" />
        <form class="nx-acceso__form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="cabecera">
            <app-logo class="md" />
            <h1 class="nx-text-heading-2">{{ 'login.submit' | transloco }}</h1>
          </div>

          @switch (error()) {
            @case ('invalid') { <app-alert tone="error">{{ 'login.invalidCredentials' | transloco }}</app-alert> }
            @case ('locked') { <app-alert tone="error">{{ 'login.locked' | transloco }}</app-alert> }
            @case ('offline') {
              <app-alert tone="error">
                <span>{{ 'support.connection.title' | transloco }}</span>
                <span>{{ 'support.connection.description' | transloco }}</span>
              </app-alert>
            }
          }

          <div class="nx-campo">
            <label class="nx-campo__label" for="login-email">{{ 'login.email' | transloco }} <span aria-hidden="true">*</span></label>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <input matInput id="login-email" type="email" formControlName="email" autocomplete="email" required />
            </mat-form-field>
          </div>

          <div class="nx-campo">
            <label class="nx-campo__label" for="login-password">{{ 'login.password' | transloco }} <span aria-hidden="true">*</span></label>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <input matInput id="login-password" [type]="showPassword() ? 'text' : 'password'" formControlName="password" autocomplete="current-password" required />
              <button
                mat-icon-button
                matSuffix
                type="button"
                (click)="showPassword.set(!showPassword())"
                [attr.aria-label]="(showPassword() ? 'login.hidePassword' : 'login.showPassword') | transloco"
                [attr.aria-pressed]="showPassword()"
              >
                <mat-icon>{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
            </mat-form-field>
          </div>

          <div class="nx-campo">
            <label class="nx-campo__label" for="login-company">{{ 'login.companyCode' | transloco }}</label>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <input matInput id="login-company" formControlName="companyCode" autocomplete="organization" />
            </mat-form-field>
          </div>

          <button mat-flat-button type="submit" class="nx-boton--block enviar" [disabled]="loading()" [attr.aria-busy]="loading()">
            @if (loading()) { <span class="nx-spin" aria-hidden="true"></span> }
            {{ 'login.submit' | transloco }}
          </button>

          <p class="pie nx-text-caption">{{ 'login.copyright' | transloco: { year } }}</p>
        </form>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly error = signal<LoginError | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly year = new Date().getFullYear();

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    companyCode: [''],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const { email, password, companyCode } = this.form.getRawValue();
    this.authService.login({ email, password, companyCode: companyCode || undefined }).subscribe({
      next: () => {
        this.loading.set(false);
        void this.router.navigate(['/dashboard']);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        const status = err instanceof HttpErrorResponse ? err.status : null;
        if (status === 0) this.error.set('offline');
        else if (status === 423 || problemCode(err) === 'ACCOUNT_LOCKED') this.error.set('locked');
        else this.error.set('invalid');
      },
    });
  }
}
