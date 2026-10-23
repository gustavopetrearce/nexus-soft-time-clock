import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthService } from '../core/auth/auth.service';
import { AuthStore } from '../core/auth/auth.store';
import { ChangePasswordDialogComponent } from '../core/auth/change-password-dialog.component';
import { LanguageSwitcherComponent } from '../core/i18n/language-switcher.component';
import { ThemeService } from '../core/theme/theme.service';
import { roleLabel } from '../features/admin/roles/role.models';

/**
 * Shell de la aplicación autenticada: topbar (marca + idioma + tema + usuario) y sidenav de
 * navegación agrupada, gateada por permiso (RBAC). Carga la identidad actual (/me) al entrar.
 */
@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatDividerModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    TranslocoPipe,
    LanguageSwitcherComponent,
  ],
  styles: [
    `
      .layout { display: flex; flex-direction: column; height: 100vh; }
      .content { padding: 24px; }
      .brand-word { font-weight: 700; letter-spacing: -0.01em; }

      mat-sidenav { width: 264px; }
      .brand {
        display: flex; align-items: center; gap: 12px;
        padding: 18px 20px; border-bottom: 1px solid var(--sidenav-border);
      }
      .brand .logo { width: 34px; height: 34px; flex: 0 0 auto; }
      .brand .name { font-weight: 700; font-size: 1.05rem; line-height: 1; color: var(--sidenav-text); }
      .brand .tag { font-size: 0.72rem; color: var(--sidenav-text-muted); }

      .nav-group {
        padding: 18px 20px 6px; font-size: 0.7rem; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.06em; color: var(--sidenav-text-muted);
      }
      mat-nav-list a.nav-item,
      mat-nav-list a.nav-item mat-icon,
      mat-nav-list a.nav-item span {
        color: var(--sidenav-text);
      }
      a.nav-item {
        margin: 2px 10px; border-radius: 10px;
        border-left: 3px solid transparent;
      }
      a.nav-item:hover:not(.active) { background: var(--sidenav-surface); }
      a.nav-item.active {
        background: var(--sidenav-active-bg);
        border-left-color: var(--sidenav-brand);
        color: var(--sidenav-active-text) !important;
      }
      a.nav-item.active mat-icon, a.nav-item.active span { color: var(--sidenav-active-text) !important; }

      .avatar {
        width: 32px; height: 32px; border-radius: 50%;
        display: grid; place-items: center; font-size: 0.72rem; font-weight: 700;
        background: color-mix(in srgb, var(--brand) 16%, transparent); color: var(--brand);
      }
      .user-btn { display: flex; align-items: center; gap: 8px; }
      .menu-head { padding: 12px 16px; max-width: 260px; }
      .menu-head .who { font-weight: 600; }
    `,
  ],
  template: `
    <div class="layout">
      <mat-toolbar color="primary">
        <button mat-icon-button (click)="drawer.toggle()" [attr.aria-label]="'layout.menu' | transloco">
          <mat-icon>menu</mat-icon>
        </button>
        <span class="brand-word" style="margin-left:4px">Nexus Soft Time Clock</span>
        <span class="spacer"></span>
        <div class="toolbar-actions">
          <app-language-switcher />
          <button mat-icon-button (click)="theme.toggle()" [attr.aria-label]="'layout.toggleTheme' | transloco">
            <mat-icon>{{ isDark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
          </button>
          <button mat-button [matMenuTriggerFor]="userMenu" class="user-btn">
            <span class="avatar">{{ initials() }}</span>
            <span>{{ userLabel() }}</span>
            <mat-icon>arrow_drop_down</mat-icon>
          </button>
        </div>
        <mat-menu #userMenu="matMenu">
          <div class="menu-head">
            <div class="who">{{ userLabel() }}</div>
            <div class="muted" style="font-size:.82rem">{{ tenantLabel() }}</div>
            <div class="muted" style="font-size:.82rem">{{ rolesLabel() }}</div>
          </div>
          <mat-divider></mat-divider>
          <button mat-menu-item (click)="openChangePassword()">
            <mat-icon>lock_reset</mat-icon>
            <span>{{ 'layout.changePassword' | transloco }}</span>
          </button>
          <button mat-menu-item (click)="logout()">
            <mat-icon>logout</mat-icon>
            <span>{{ 'layout.logout' | transloco }}</span>
          </button>
        </mat-menu>
      </mat-toolbar>

      <mat-sidenav-container style="flex:1 1 auto">
        <mat-sidenav #drawer mode="side" opened>
          <div class="brand">
            <svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
              <defs>
                <linearGradient id="navlogo" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#5c6bc0" />
                  <stop offset="1" stop-color="#303f9f" />
                </linearGradient>
              </defs>
              <rect width="64" height="64" rx="16" fill="url(#navlogo)" />
              <circle cx="32" cy="32" r="18" fill="none" stroke="#fff" stroke-width="3.5" />
              <path d="M32 22v11l7 5" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <div>
              <div class="name">Nexus</div>
              <div class="tag">Time Clock</div>
            </div>
          </div>

          <mat-nav-list>
            <a mat-list-item class="nav-item" routerLink="/dashboard" routerLinkActive="active">
              <mat-icon matListItemIcon>dashboard</mat-icon>
              <span matListItemTitle>{{ 'layout.nav.dashboard' | transloco }}</span>
            </a>
            @if (can('dashboard:read')) {
              <a mat-list-item class="nav-item" routerLink="/map" routerLinkActive="active">
                <mat-icon matListItemIcon>public</mat-icon>
                <span matListItemTitle>{{ 'layout.nav.map' | transloco }}</span>
              </a>
            }

            @if (can('incident:approve')) {
              <a mat-list-item class="nav-item" routerLink="/incidents" routerLinkActive="active">
                <mat-icon matListItemIcon>report_problem</mat-icon>
                <span matListItemTitle>{{ 'layout.nav.incidents' | transloco }}</span>
              </a>
            }

            @if (can('report:export') || can('audit:read')) {
              <div class="nav-group">{{ 'layout.group.analysis' | transloco }}</div>
              @if (can('report:export')) {
                <a mat-list-item class="nav-item" routerLink="/reports" routerLinkActive="active">
                  <mat-icon matListItemIcon>bar_chart</mat-icon>
                  <span matListItemTitle>{{ 'layout.nav.reports' | transloco }}</span>
                </a>
                <a mat-list-item class="nav-item" routerLink="/attendance-events" routerLinkActive="active">
                  <mat-icon matListItemIcon>login</mat-icon>
                  <span matListItemTitle>{{ 'layout.nav.attendanceEvents' | transloco }}</span>
                </a>
                
              }
              @if (can('audit:read')) {
                <a mat-list-item class="nav-item" routerLink="/audit" routerLinkActive="active">
                  <mat-icon matListItemIcon>fact_check</mat-icon>
                  <span matListItemTitle>{{ 'layout.nav.audit' | transloco }}</span>
                </a>
              }
            }

            @if (can('user:manage') || can('company:manage') || can('worksite:manage') || can('project:manage')) {
              <div class="nav-group">{{ 'layout.group.organization' | transloco }}</div>
              @if (can('user:manage')) {
                <a mat-list-item class="nav-item" routerLink="/users" routerLinkActive="active">
                  <mat-icon matListItemIcon>group</mat-icon>
                  <span matListItemTitle>{{ 'layout.nav.users' | transloco }}</span>
                </a>
                <a mat-list-item class="nav-item" routerLink="/people" routerLinkActive="active">
                  <mat-icon matListItemIcon>groups</mat-icon>
                  <span matListItemTitle>{{ 'layout.nav.people' | transloco }}</span>
                </a>
              }
              @if (can('company:manage')) {
                <a mat-list-item class="nav-item" routerLink="/companies" routerLinkActive="active">
                  <mat-icon matListItemIcon>business</mat-icon>
                  <span matListItemTitle>{{ 'layout.nav.companies' | transloco }}</span>
                </a>
              }
              @if (can('worksite:manage')) {
                <a mat-list-item class="nav-item" routerLink="/work-sites" routerLinkActive="active">
                  <mat-icon matListItemIcon>place</mat-icon>
                  <span matListItemTitle>{{ 'layout.nav.workSites' | transloco }}</span>
                </a>
              }
              @if (can('project:manage')) {
                <a mat-list-item class="nav-item" routerLink="/projects" routerLinkActive="active">
                  <mat-icon matListItemIcon>work</mat-icon>
                  <span matListItemTitle>{{ 'layout.nav.projects' | transloco }}</span>
                </a>
              }
            }

            @if (can('schedule:manage') || can('vacation:approve')) {
              <div class="nav-group">{{ 'layout.group.planning' | transloco }}</div>
              @if (can('schedule:manage')) {
                <a mat-list-item class="nav-item" routerLink="/scheduling" routerLinkActive="active">
                  <mat-icon matListItemIcon>event</mat-icon>
                  <span matListItemTitle>{{ 'layout.nav.scheduling' | transloco }}</span>
                </a>
                <a mat-list-item class="nav-item" routerLink="/event-types" routerLinkActive="active">
                  <mat-icon matListItemIcon>tune</mat-icon>
                  <span matListItemTitle>{{ 'layout.nav.eventTypes' | transloco }}</span>
                </a>
              }
              @if (can('vacation:approve')) {
                <a mat-list-item class="nav-item" routerLink="/vacations" routerLinkActive="active">
                  <mat-icon matListItemIcon>beach_access</mat-icon>
                  <span matListItemTitle>{{ 'layout.nav.vacations' | transloco }}</span>
                </a>
              }
            }

            <div class="nav-group">{{ 'layout.group.account' | transloco }}</div>
            <a mat-list-item class="nav-item" routerLink="/notifications" routerLinkActive="active">
              <mat-icon matListItemIcon>notifications</mat-icon>
              <span matListItemTitle>{{ 'layout.nav.notifications' | transloco }}</span>
            </a>
            @if (can('vacation:manage')) {
              <a mat-list-item class="nav-item" routerLink="/settings" routerLinkActive="active">
                <mat-icon matListItemIcon>settings</mat-icon>
                <span matListItemTitle>{{ 'layout.nav.settings' | transloco }}</span>
              </a>
            }
          </mat-nav-list>
        </mat-sidenav>

        <mat-sidenav-content class="content">
          <div class="page">
            <router-outlet />
          </div>
        </mat-sidenav-content>
      </mat-sidenav-container>
    </div>
  `,
})
export class MainLayoutComponent {
  private readonly authService = inject(AuthService);
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);
  protected readonly theme = inject(ThemeService);

  protected readonly user = this.store.user;
  protected readonly isDark = computed(() => this.theme.theme() === 'dark');

  constructor() {
    if (!this.store.user()) {
      this.authService.loadCurrentUser().subscribe({ error: () => void 0 });
    }
  }

  protected can(permission: string): boolean {
    return this.store.hasPermission(permission);
  }

  protected userLabel(): string {
    const roles = this.store.user()?.roles ?? [];
    return roles.length > 0 ? roleLabel(roles[0]) : this.transloco.translate('layout.user');
  }

  /** Roles del usuario en el idioma activo, separados por coma (p. ej. «Super Administrador»). */
  protected rolesLabel(): string {
    return (this.store.user()?.roles ?? []).map(roleLabel).join(', ');
  }

  /** Ámbito legible del usuario, sin ids (Plataforma para admins de plataforma). */
  protected tenantLabel(): string {
    return this.store.user()?.platformAdmin
      ? this.transloco.translate('layout.scope.platform')
      : this.transloco.translate('layout.scope.company');
  }

  /** Iniciales para el avatar, derivadas del rol principal (p. ej. SUPER_ADMIN → SA). */
  protected initials(): string {
    const label = this.userLabel();
    const parts = label.split(/[_\s]+/).filter(Boolean);
    const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : label.slice(0, 2);
    return letters.toUpperCase();
  }

  protected openChangePassword(): void {
    this.dialog
      .open(ChangePasswordDialogComponent, { width: '460px', maxWidth: '96vw', autoFocus: false })
      .afterClosed()
      .subscribe((changed) => {
        // El cambio revoca las sesiones activas (incluida esta): forzamos re-login.
        if (changed) {
          this.logout();
        }
      });
  }

  protected logout(): void {
    this.authService.logout();
    void this.router.navigate(['/login']);
  }
}
