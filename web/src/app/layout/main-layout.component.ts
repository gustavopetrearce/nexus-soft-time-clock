import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { filter } from 'rxjs';

import { AuthService } from '../core/auth/auth.service';
import { AuthStore } from '../core/auth/auth.store';
import { ConnectionStore } from '../core/connection/connection.store';
import { ChangePasswordDialogComponent } from '../core/auth/change-password-dialog.component';
import { LanguageSwitcherComponent } from '../core/i18n/language-switcher.component';
import { ThemeService } from '../core/theme/theme.service';
import { LogoComponent } from '../core/ui/logo.component';
import { ScrollDirective } from '../core/ui/scroll.directive';
import { roleLabel } from '../features/admin/roles/role.models';
import { ConnectionErrorComponent } from '../features/support/connection-error.component';

interface NavItem {
  route: string;
  icon: string;
  /** Clave `layout.nav.<key>`. */
  key: string;
  /** Permiso requerido; sin permiso el ítem se muestra a todos. */
  permission?: string;
}

interface NavGroup {
  /** Clave `layout.group.<key>`; sin clave, el grupo va sin encabezado. */
  key?: string;
  items: NavItem[];
}

/** Menú real del portal (LOWFI/05), en el orden de la maqueta hi-fi. */
const NAV: readonly NavGroup[] = [
  {
    items: [
      { route: '/dashboard', icon: 'dashboard', key: 'dashboard' },
      { route: '/map', icon: 'public', key: 'map', permission: 'dashboard:read' },
      { route: '/incidents', icon: 'report_problem', key: 'incidents', permission: 'incident:approve' },
    ],
  },
  {
    key: 'analysis',
    items: [
      { route: '/reports', icon: 'bar_chart', key: 'reports', permission: 'report:export' },
      { route: '/attendance-events', icon: 'login', key: 'attendanceEvents', permission: 'report:export' },
      { route: '/reports/attendance-records', icon: 'history', key: 'attendanceRecords', permission: 'report:export' },
      { route: '/audit', icon: 'fact_check', key: 'audit', permission: 'audit:read' },
    ],
  },
  {
    key: 'organization',
    items: [
      { route: '/users', icon: 'group', key: 'users', permission: 'user:manage' },
      { route: '/people', icon: 'groups', key: 'people', permission: 'user:manage' },
      { route: '/companies', icon: 'business', key: 'companies', permission: 'company:manage' },
      { route: '/work-sites', icon: 'location_on', key: 'workSites', permission: 'worksite:manage' },
      { route: '/projects', icon: 'work', key: 'projects', permission: 'project:manage' },
    ],
  },
  {
    key: 'planning',
    items: [
      { route: '/scheduling', icon: 'event', key: 'scheduling', permission: 'schedule:manage' },
      { route: '/event-types', icon: 'tune', key: 'eventTypes', permission: 'schedule:manage' },
      { route: '/vacations', icon: 'beach_access', key: 'vacations', permission: 'vacation:approve' },
    ],
  },
  {
    key: 'account',
    items: [
      { route: '/notifications', icon: 'notifications', key: 'notifications' },
      { route: '/settings', icon: 'settings', key: 'settings', permission: 'vacation:manage' },
    ],
  },
];

/**
 * Shell del portal (DS/09 n.º 25–26): toolbar y navegación lateral filtrada por permiso (RBAC).
 * La navegación arranca cerrada en todos los anchos y se abre encima del contenido con velo; se
 * cierra con la X, el velo, Esc o al elegir un ítem. Al abrir, el foco va al primer ítem y al
 * cerrar vuelve al botón de menú (MatSidenav en modo `over`). Carga la identidad actual (/me).
 */
@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    ConnectionErrorComponent,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatDividerModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    TranslocoPipe,
    LanguageSwitcherComponent,
    LogoComponent,
    ScrollDirective,
  ],
  styles: [
    `
      :host { display: block; height: 100vh; }
      mat-sidenav-container { height: 100%; }

      /* Navegación lateral: la ficha .nx-nav, dentro del panel de MatSidenav. */
      mat-sidenav {
        border-right: var(--nx-border-width-default) solid var(--nx-color-nav-border);
        box-shadow: var(--nx-shadow-3);
        color-scheme: dark;
      }
      .nx-nav { position: static; transform: none; visibility: visible; box-shadow: none; border: 0; min-height: 100%; }
      .nx-nav__logo .nx-lockup { color: var(--nx-color-on-surface-brand); }
      .nx-nav__cerrar { --mdc-icon-button-icon-color: var(--nx-color-nav-icon); }
      .nx-nav__item mat-icon { color: var(--nx-color-nav-icon); }
      .nx-nav__item.is-active mat-icon { color: var(--nx-color-nav-active-fg); }

      /* Toolbar: fija arriba del contenido que se desplaza. */
      mat-sidenav-content { display: flex; flex-direction: column; }
      .mat-toolbar {
        position: sticky;
        top: var(--nx-space-0);
        z-index: 2;
        flex: none;
        gap: var(--nx-space-gap-inline);
        padding: var(--nx-space-0) var(--nx-space-inset-page);
      }
      .nx-toolbar__marca { font-size: var(--nx-text-heading-4-size); font-weight: var(--nx-font-weight-semibold); }
      .nx-toolbar__perfil { border: 0; background: transparent; font: inherit; cursor: pointer; }
      .nx-toolbar__perfil:hover { background: var(--nx-color-surface-hover); }
      .nx-toolbar__perfil mat-icon { color: var(--nx-color-text-secondary); }

      .nx-pagina { margin: var(--nx-space-0) auto; }

      .menu-head { padding: var(--nx-space-3) var(--nx-space-4); max-width: calc(var(--nx-space-16) * 4); }
      .menu-head .who { font-weight: var(--nx-font-weight-semibold); }

      /* Estrecho: solo el isotipo, para que quepan idioma, tema y perfil. */
      .nx-toolbar__nombre { display: none; }

      @media (min-width: 700px) {
        .nx-toolbar__nombre { display: inline; }
        .nx-toolbar__empresa { display: inline-flex; }
        .nx-toolbar__perfil .nx-text-small { display: inline; }
      }
    `,
  ],
  template: `
    <mat-sidenav-container>
      <mat-sidenav #drawer mode="over" autoFocus=".nx-nav__item">
        <nav class="nx-nav" nxScroll [attr.aria-label]="'layout.navLabel' | transloco">
          <div class="nx-nav__logo">
            <span class="nx-lockup nx-lockup--compact">
              <app-logo />
              <span class="nx-lockup__name">Nexus<small>Time Clock</small></span>
            </span>
            <button mat-icon-button class="nx-nav__cerrar" (click)="drawer.close()" [attr.aria-label]="'layout.closeMenu' | transloco">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          @for (group of nav(); track $index) {
            @if (group.key) {
              <div class="nx-nav__grupo nx-text-heading-6">{{ 'layout.group.' + group.key | transloco }}</div>
            }
            @for (item of group.items; track item.route) {
              <a
                class="nx-nav__item"
                [routerLink]="item.route"
                routerLinkActive="is-active"
                [routerLinkActiveOptions]="{ exact: item.route === '/reports' }"
                ariaCurrentWhenActive="page"
                #rla="routerLinkActive"
              >
                <mat-icon [fontSet]="rla.isActive ? 'material-icons' : 'material-icons-outlined'">{{ item.icon }}</mat-icon>
                <span class="nx-nav__label">{{ 'layout.nav.' + item.key | transloco }}</span>
              </a>
            }
          }
        </nav>
      </mat-sidenav>

      <mat-sidenav-content nxScroll (scroll)="onScroll($event)">
        <mat-toolbar [class.is-raised]="raised()">
          <button
            #menuButton
            mat-icon-button
            (click)="drawer.open()"
            [attr.aria-label]="'layout.menu' | transloco"
            [attr.aria-expanded]="drawer.opened"
          >
            <mat-icon>menu</mat-icon>
          </button>
          <a class="nx-toolbar__marca" routerLink="/dashboard" [attr.aria-label]="'layout.home' | transloco">
            <app-logo />
            <span class="nx-toolbar__nombre">Nexus Soft Time Clock</span>
          </a>
          <span class="nx-toolbar__esp"></span>
          <span class="nx-toolbar__empresa nx-text-small-strong">
            <mat-icon>domain</mat-icon>{{ tenantLabel() }}
          </span>
          <app-language-switcher />
          <button
            mat-icon-button
            (click)="theme.toggle()"
            [attr.aria-label]="(isDark() ? 'layout.toThemeLight' : 'layout.toThemeDark') | transloco"
          >
            <mat-icon>{{ isDark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
          </button>
          <button class="nx-toolbar__perfil" [matMenuTriggerFor]="userMenu" [attr.aria-label]="'layout.profile' | transloco">
            <mat-icon>account_circle</mat-icon>
            <span class="nx-text-small">{{ userLabel() }}</span>
            <mat-icon>arrow_drop_down</mat-icon>
          </button>
          <mat-menu #userMenu="matMenu" xPosition="before">
            <div class="menu-head">
              <div class="who">{{ userLabel() }}</div>
              <div class="nx-sec nx-text-small">{{ tenantLabel() }}</div>
              <div class="nx-sec nx-text-small">{{ rolesLabel() }}</div>
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

        <main class="nx-pagina">
          <!-- S03: sin conexión se muestra el error en lugar de la pantalla; al reintentar, el
               outlet se vuelve a crear y la pantalla recarga sus datos. -->
          @if (connection.lost()) {
            <app-connection-error (retry)="connection.reset()" />
          } @else {
            <router-outlet />
          }
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
})
export class MainLayoutComponent {
  private readonly authService = inject(AuthService);
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);
  protected readonly theme = inject(ThemeService);
  protected readonly connection = inject(ConnectionStore);

  private readonly drawer = viewChild.required<MatSidenav>('drawer');
  private readonly menuButton = viewChild.required('menuButton', { read: ElementRef<HTMLElement> });

  protected readonly isDark = computed(() => this.theme.theme() === 'dark');
  /** La toolbar toma `shadow-2` solo cuando el contenido se desplazó (HIFI/08 R2). */
  protected readonly raised = signal(false);

  /** Grupos e ítems que el usuario puede ver (C5: sin permiso, no aparecen). */
  protected readonly nav = computed(() => {
    this.store.user(); // recalcula cuando llega /me
    return NAV.map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permission || this.store.hasPermission(item.permission)),
    })).filter((group) => group.items.length > 0);
  });

  constructor() {
    if (!this.store.user()) {
      this.authService.loadCurrentUser().subscribe({ error: () => void 0 });
    }
    // Elegir un ítem cierra la navegación; el foco vuelve al botón de menú. Navegar también
    // reintenta tras un error de conexión.
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => {
        this.connection.reset();
        if (this.drawer().opened) {
          void this.drawer()
            .close()
            .then(() => this.menuButton().nativeElement.focus());
        }
      });
  }

  protected onScroll(event: Event): void {
    this.raised.set((event.target as HTMLElement).scrollTop > 0);
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
