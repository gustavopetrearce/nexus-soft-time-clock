import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthService } from '../../core/auth/auth.service';
import { LanguageSwitcherComponent } from '../../core/i18n/language-switcher.component';
import { LogoComponent } from '../../core/ui/logo.component';

interface Feature {
  icon: string;
  /** Prefijo de claves: `login.features.<key>.title` / `.text`. */
  key: string;
}

const FEATURES: readonly Feature[] = [
  { icon: 'my_location', key: 'geofence' },
  { icon: 'insights', key: 'realtime' },
  { icon: 'domain', key: 'multiCompany' },
];

/** Pantalla de inicio de sesión (RF-01): layout partido con panel de marca y formulario. */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslocoPipe,
    LanguageSwitcherComponent,
    LogoComponent,
  ],
  styles: [
    `
      .auth { display: flex; min-height: 100vh; background: var(--nx-color-surface-default); }

      .hero {
        flex: 1 1 0;
        background: var(--nx-color-bg-app);
        color: var(--nx-color-text-primary);
        padding: var(--nx-space-8) clamp(32px, 6vw, 72px);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        position: relative;
        overflow: hidden;
        border-right: 1px solid var(--nx-color-border-default);
      }
      .hero::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image: radial-gradient(var(--nx-color-border-strong) 1px, transparent 1px);
        background-size: 22px 22px;
        opacity: 0.6;
      }
      .hero-art {
        position: absolute;
        right: clamp(-80px, -6vw, -20px);
        bottom: -60px;
        width: min(52vw, 480px);
        height: auto;
        opacity: 0.8;
        color: var(--nx-color-action-primary);
        pointer-events: none;
      }
      .hero-top { position: relative; }
      .hero .brand { display: flex; align-items: center; gap: var(--nx-space-3); }
      .hero .brand-word { font-size: 1.05rem; font-weight: var(--nx-font-weight-bold); letter-spacing: -0.01em; color: var(--nx-color-text-primary); }

      .hero-main { position: relative; margin-top: var(--nx-space-8); }
      .hero h1 { font-size: clamp(1.9rem, 3vw, 2.5rem); margin: 0 0 var(--nx-space-3); line-height: 1.15; font-weight: var(--nx-font-weight-bold); letter-spacing: -0.01em; color: var(--nx-color-text-primary); }
      .hero .lead { font-size: var(--nx-text-heading-2-size); color: var(--nx-color-text-secondary); max-width: 440px; margin: 0; }

      .features { display: flex; flex-direction: column; gap: var(--nx-space-4); margin-top: var(--nx-space-8); position: relative; }
      .feature { display: flex; align-items: flex-start; gap: var(--nx-space-3); }
      .feature-icon {
        flex: 0 0 auto;
        width: 40px; height: 40px;
        border-radius: var(--nx-radius-md);
        background: var(--nx-color-action-primary-subtle);
        display: grid; place-items: center;
      }
      .feature-icon mat-icon { color: var(--nx-color-action-primary); }
      .feature-title { font-weight: var(--nx-font-weight-semibold); font-size: var(--nx-text-body-size); margin: 0 0 2px; color: var(--nx-color-text-primary); }
      .feature-text { font-size: var(--nx-text-small-size); color: var(--nx-color-text-secondary); margin: 0; max-width: 340px; }

      .hero .foot { font-size: var(--nx-text-caption-size); color: var(--nx-color-text-disabled); position: relative; }

      .panel {
        flex: 0 0 clamp(400px, 40%, 520px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--nx-space-8);
        background: var(--nx-color-surface-default);
        position: relative;
      }
      .card { width: 100%; max-width: 380px; }
      .lang { position: absolute; top: var(--nx-space-4); right: var(--nx-space-4); }
      .avatar {
        width: 56px; height: 56px;
        border-radius: var(--nx-radius-full);
        background: var(--nx-color-action-primary-subtle);
        display: grid; place-items: center;
        margin: 0 auto var(--nx-space-4);
      }
      .avatar mat-icon { color: var(--nx-color-action-primary); font-size: 28px; width: 28px; height: 28px; }
      .card h2 { margin: 0 0 4px; font-size: var(--nx-text-heading-2-size); font-weight: var(--nx-font-weight-bold); text-align: center; }
      .card .sub { color: var(--nx-color-text-secondary); margin: 0 0 var(--nx-space-6); font-size: var(--nx-text-body-size); text-align: center; }

      .secure-note {
        display: flex; align-items: center; justify-content: center; gap: 6px;
        margin-top: var(--nx-space-4);
        color: var(--nx-color-text-disabled);
        font-size: var(--nx-text-caption-size);
      }
      .secure-note mat-icon { font-size: 14px; width: 14px; height: 14px; }

      @media (max-width: 900px) {
        .hero { display: none; }
        .panel { flex: 1 1 auto; }
      }
    `,
  ],
  template: `
    <div class="auth">
      <div class="hero">
        <div class="hero-top">
          <div class="brand">
            <app-logo class="logo md" />
            <span class="brand-word">Nexus Soft Time Clock</span>
          </div>

          <div class="hero-main">
            <h1>{{ 'login.heroTitle1' | transloco }}<br />{{ 'login.heroTitle2' | transloco }}</h1>
            <p class="lead">{{ 'login.heroLead' | transloco }}</p>
          </div>

          <div class="features">
            @for (f of features; track f.key) {
              <div class="feature">
                <div class="feature-icon"><mat-icon>{{ f.icon }}</mat-icon></div>
                <div>
                  <p class="feature-title">{{ 'login.features.' + f.key + '.title' | transloco }}</p>
                  <p class="feature-text">{{ 'login.features.' + f.key + '.text' | transloco }}</p>
                </div>
              </div>
            }
          </div>
        </div>

        <div class="foot">{{ 'login.footer' | transloco }}</div>

        <svg class="hero-art" viewBox="0 0 400 400" aria-hidden="true">
          <circle cx="210" cy="210" r="160" stroke="currentColor" stroke-opacity="0.12" stroke-width="1.5" fill="none" />
          <circle cx="210" cy="210" r="120" stroke="currentColor" stroke-opacity="0.18" stroke-width="1.5" fill="none" />
          <line x1="210" y1="210" x2="90" y2="130" stroke="currentColor" stroke-opacity="0.16" stroke-width="1" />
          <line x1="210" y1="210" x2="360" y2="150" stroke="currentColor" stroke-opacity="0.16" stroke-width="1" />
          <line x1="210" y1="210" x2="120" y2="340" stroke="currentColor" stroke-opacity="0.16" stroke-width="1" />
          <line x1="210" y1="210" x2="210" y2="90" stroke="currentColor" stroke-opacity="0.4" stroke-width="3" stroke-linecap="round" />
          <line x1="210" y1="210" x2="270" y2="240" stroke="currentColor" stroke-opacity="0.6" stroke-width="3" stroke-linecap="round" />
          <circle cx="210" cy="210" r="5" fill="currentColor" />
          <circle cx="90" cy="130" r="5" fill="currentColor" fill-opacity="0.6" />
          <circle cx="360" cy="150" r="4" fill="currentColor" fill-opacity="0.45" />
          <circle cx="120" cy="340" r="4" fill="currentColor" fill-opacity="0.45" />
          <circle cx="330" cy="330" r="3" fill="currentColor" fill-opacity="0.3" />
        </svg>
      </div>

      <div class="panel">
        <app-language-switcher class="lang" />
        <div class="card">
          @if (loading()) { <mat-progress-bar mode="indeterminate" style="margin-bottom:16px" /> }

          <div class="avatar"><mat-icon>person</mat-icon></div>
          <h2>{{ 'login.welcome' | transloco }}</h2>
          <p class="sub">{{ 'login.subtitle' | transloco }}</p>

          <form [formGroup]="form" (ngSubmit)="submit()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'login.email' | transloco }}</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="username" />
              <mat-icon matPrefix style="margin-right:8px">mail</mat-icon>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'login.password' | transloco }}</mat-label>
              <input matInput [type]="showPassword() ? 'text' : 'password'" formControlName="password" autocomplete="current-password" />
              <mat-icon matPrefix style="margin-right:8px">lock</mat-icon>
              <button
                mat-icon-button
                matSuffix
                type="button"
                (click)="showPassword.set(!showPassword())"
                [attr.aria-label]="(showPassword() ? 'login.hidePassword' : 'login.showPassword') | transloco"
              >
                <mat-icon>{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'login.companyCode' | transloco }}</mat-label>
              <input matInput formControlName="companyCode" [placeholder]="'login.companyCodePlaceholder' | transloco" />
              <mat-icon matPrefix style="margin-right:8px">business</mat-icon>
              <mat-icon matSuffix [matTooltip]="'login.companyCodeHint' | transloco">info</mat-icon>
            </mat-form-field>

            @if (error()) { <p class="error-text">{{ error() }}</p> }

            <button mat-flat-button color="primary" type="submit" class="full-width"
                    [disabled]="form.invalid || loading()" style="height:46px">
              <mat-icon>login</mat-icon> {{ 'login.submit' | transloco }}
            </button>
          </form>

          <div class="secure-note"><mat-icon>lock</mat-icon> {{ 'login.secure' | transloco }}</div>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly features = FEATURES;
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    companyCode: [''],
  });

  protected submit(): void {
    if (this.form.invalid) {
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
      error: () => {
        this.loading.set(false);
        this.error.set(this.transloco.translate('login.invalidCredentials'));
      },
    });
  }
}
