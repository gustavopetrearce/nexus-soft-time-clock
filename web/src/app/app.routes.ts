import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { requirePermission } from './core/guards/permission.guard';

/**
 * Enrutado con lazy loading + standalone components (Angular Style Guide).
 * - /login: página pública sin shell.
 * - '' : shell autenticado (MainLayout) que envuelve las páginas privadas (rutas hijas),
 *        protegido por authGuard; cada ruta añade su guard de permiso (RBAC).
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/main-layout.component').then((m) => m.MainLayoutComponent),
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/admin/dashboard/metrics-dashboard.component').then(
            (m) => m.MetricsDashboardComponent,
          ),
      },
      {
        path: 'map',
        canActivate: [requirePermission('dashboard:read')],
        loadComponent: () =>
          import('./features/realtime-map/realtime-map.component').then((m) => m.RealtimeMapComponent),
      },
      {
        path: 'incidents',
        canActivate: [requirePermission('incident:approve')],
        loadComponent: () => import('./features/incidents/incidents.component').then((m) => m.IncidentsComponent),
      },
      {
        path: 'reports',
        canActivate: [requirePermission('report:export')],
        loadComponent: () => import('./features/reports/reports.component').then((m) => m.ReportsComponent),
      },
      {
        path: 'attendance-events',
        canActivate: [requirePermission('report:export')],
        loadComponent: () =>
          import('./features/attendance-events/attendance-events.component').then((m) => m.AttendanceEventsComponent),
      },
      {
        path: 'reports/attendance-records',
        canActivate: [requirePermission('report:export')],
        loadComponent: () =>
          import('./features/reports/attendance-records/attendance-records.component').then(
            (m) => m.AttendanceRecordsComponent,
          ),
      },
      {
        path: 'audit',
        canActivate: [requirePermission('audit:read')],
        loadComponent: () => import('./features/audit/audit.component').then((m) => m.AuditComponent),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./features/notifications/notifications.component').then((m) => m.NotificationsComponent),
      },
      {
        path: 'companies',
        canActivate: [requirePermission('company:manage')],
        loadComponent: () =>
          import('./features/admin/companies/companies.component').then((m) => m.CompaniesComponent),
      },
      {
        path: 'companies/new',
        canActivate: [requirePermission('company:manage')],
        loadComponent: () =>
          import('./features/admin/companies/company-form.component').then((m) => m.CompanyFormComponent),
      },
      {
        path: 'companies/:id/edit',
        canActivate: [requirePermission('company:manage')],
        loadComponent: () =>
          import('./features/admin/companies/company-form.component').then((m) => m.CompanyFormComponent),
      },
      {
        path: 'users',
        canActivate: [requirePermission('user:manage')],
        loadComponent: () => import('./features/admin/users/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'people',
        canActivate: [requirePermission('user:manage')],
        loadComponent: () => import('./features/people/people.component').then((m) => m.PeopleComponent),
      },
      {
        path: 'work-sites',
        canActivate: [requirePermission('worksite:manage')],
        loadComponent: () =>
          import('./features/admin/work-sites/work-sites.component').then((m) => m.WorkSitesComponent),
      },
      {
        path: 'work-sites/new',
        canActivate: [requirePermission('worksite:manage')],
        loadComponent: () =>
          import('./features/admin/work-sites/work-site-form.component').then((m) => m.WorkSiteFormComponent),
      },
      {
        path: 'work-sites/:id/edit',
        canActivate: [requirePermission('worksite:manage')],
        loadComponent: () =>
          import('./features/admin/work-sites/work-site-form.component').then((m) => m.WorkSiteFormComponent),
      },
      {
        path: 'work-sites/:id/geofence',
        canActivate: [requirePermission('geofence:manage')],
        loadComponent: () =>
          import('./features/admin/work-sites/geofence/geofence.component').then((m) => m.GeofenceComponent),
      },
      {
        path: 'projects',
        canActivate: [requirePermission('project:manage')],
        loadComponent: () => import('./features/admin/projects/projects.component').then((m) => m.ProjectsComponent),
      },
      {
        path: 'projects/new',
        canActivate: [requirePermission('project:manage')],
        loadComponent: () =>
          import('./features/admin/projects/project-form.component').then((m) => m.ProjectFormComponent),
      },
      {
        path: 'projects/:id/edit',
        canActivate: [requirePermission('project:manage')],
        loadComponent: () =>
          import('./features/admin/projects/project-form.component').then((m) => m.ProjectFormComponent),
      },
      {
        path: 'scheduling',
        canActivate: [requirePermission('schedule:manage')],
        loadComponent: () =>
          import('./features/admin/scheduling/scheduling.component').then((m) => m.SchedulingComponent),
      },
      {
        path: 'scheduling/new',
        canActivate: [requirePermission('schedule:manage')],
        loadComponent: () =>
          import('./features/admin/scheduling/schedule-form.component').then((m) => m.ScheduleFormComponent),
      },
      {
        path: 'scheduling/:id/edit',
        canActivate: [requirePermission('schedule:manage')],
        loadComponent: () =>
          import('./features/admin/scheduling/schedule-form.component').then((m) => m.ScheduleFormComponent),
      },
      {
        path: 'event-types',
        canActivate: [requirePermission('schedule:manage')],
        loadComponent: () =>
          import('./features/admin/event-types/event-types.component').then((m) => m.EventTypesComponent),
      },
      {
        path: 'vacations',
        canActivate: [requirePermission('vacation:approve')],
        loadComponent: () => import('./features/vacations/vacations.component').then((m) => m.VacationsComponent),
      },
      {
        path: 'settings',
        canActivate: [requirePermission('vacation:manage')],
        loadComponent: () =>
          import('./features/admin/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'forbidden',
        loadComponent: () => import('./features/support/forbidden.component').then((m) => m.ForbiddenComponent),
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: '' },
];
