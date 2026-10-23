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
  ],
  styles: [
    `
      .auth { display: flex; min-height: 100vh; background: var(--surface); }

      .hero {
        flex: 1 1 0;
        background: var(--app-bg);
        color: var(--text);
        padding: var(--sp-6) clamp(32px, 6vw, 72px);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        position: relative;
        overflow: hidden;
        border-right: 1px solid var(--border);
      }
      .hero::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image: radial-gradient(var(--border-strong) 1px, transparent 1px);
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
        pointer-events: none;
      }
      .hero-top { position: relative; }
      .hero .brand { display: flex; align-items: center; gap: var(--sp-3); }
      .hero .logo { width: 40px; height: 40px; flex: 0 0 auto; }
      .hero .brand-word { font-size: 1.05rem; font-weight: 700; letter-spacing: -0.01em; color: var(--text); }

      .hero-main { position: relative; margin-top: var(--sp-6); }
      .hero h1 { font-size: clamp(1.9rem, 3vw, 2.5rem); margin: 0 0 var(--sp-3); line-height: 1.15; font-weight: 700; letter-spacing: -0.01em; color: var(--text); }
      .hero .lead { font-size: var(--font-section-title); color: var(--text-muted); max-width: 440px; margin: 0; }

      .features { display: flex; flex-direction: column; gap: var(--sp-4); margin-top: var(--sp-6); position: relative; }
      .feature { display: flex; align-items: flex-start; gap: var(--sp-3); }
      .feature-icon {
        flex: 0 0 auto;
        width: 40px; height: 40px;
        border-radius: var(--radius-md);
        background: var(--brand-soft);
        display: grid; place-items: center;
      }
      .feature-icon mat-icon { color: var(--brand); }
      .feature-title { font-weight: 650; font-size: var(--font-body); margin: 0 0 2px; color: var(--text); }
      .feature-text { font-size: var(--font-small); color: var(--text-muted); margin: 0; max-width: 340px; }

      .hero .foot { font-size: var(--font-caption); color: var(--text-soft); position: relative; }

      .panel {
        flex: 0 0 clamp(400px, 40%, 520px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--sp-6);
        background: var(--surface);
        position: relative;
      }
      .card { width: 100%; max-width: 380px; }
      .lang { position: absolute; top: var(--sp-4); right: var(--sp-4); }
      .avatar {
        width: 56px; height: 56px;
        border-radius: 50%;
        background: var(--brand-soft);
        display: grid; place-items: center;
        margin: 0 auto var(--sp-4);
      }
      .avatar mat-icon { color: var(--brand); font-size: 28px; width: 28px; height: 28px; }
      .card h2 { margin: 0 0 4px; font-size: var(--font-section-title); font-weight: 700; text-align: center; }
      .card .sub { color: var(--text-muted); margin: 0 0 var(--sp-5); font-size: var(--font-body); text-align: center; }

      .secure-note {
        display: flex; align-items: center; justify-content: center; gap: 6px;
        margin-top: var(--sp-4);
        color: var(--text-soft);
        font-size: var(--font-caption);
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
            <svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
              <defs>
                <linearGradient id="loginlogo" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#5c6bc0" />
                  <stop offset="1" stop-color="#303f9f" />
                </linearGradient>
              </defs>
              <rect width="64" height="64" rx="16" fill="url(#loginlogo)" />
              <circle cx="32" cy="32" r="18" fill="none" stroke="#fff" stroke-width="3.5" />
              <path d="M32 22v11l7 5" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
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
          <circle cx="210" cy="210" r="160" stroke="#3949ab" stroke-opacity="0.12" stroke-width="1.5" fill="none" />
          <circle cx="210" cy="210" r="120" stroke="#3949ab" stroke-opacity="0.18" stroke-width="1.5" fill="none" />
          <line x1="210" y1="210" x2="90" y2="130" stroke="#3949ab" stroke-opacity="0.16" stroke-width="1" />
          <line x1="210" y1="210" x2="360" y2="150" stroke="#3949ab" stroke-opacity="0.16" stroke-width="1" />
          <line x1="210" y1="210" x2="120" y2="340" stroke="#3949ab" stroke-opacity="0.16" stroke-width="1" />
          <line x1="210" y1="210" x2="210" y2="90" stroke="#3949ab" stroke-opacity="0.4" stroke-width="3" stroke-linecap="round" />
          <line x1="210" y1="210" x2="270" y2="240" stroke="#3949ab" stroke-opacity="0.6" stroke-width="3" stroke-linecap="round" />
          <circle cx="210" cy="210" r="5" fill="#3949ab" />
          <circle cx="90" cy="130" r="5" fill="#3949ab" fill-opacity="0.6" />
          <circle cx="360" cy="150" r="4" fill="#3949ab" fill-opacity="0.45" />
          <circle cx="120" cy="340" r="4" fill="#3949ab" fill-opacity="0.45" />
          <circle cx="330" cy="330" r="3" fill="#3949ab" fill-opacity="0.3" />
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
