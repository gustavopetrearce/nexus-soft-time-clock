import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { AppNumberPipe } from '../../../core/i18n/app-number.pipe';
import { AlertComponent } from '../../../core/ui/alert.component';
import { ConfirmData, ConfirmDialogComponent } from '../../../core/ui/confirm-dialog.component';
import { NotificationService } from '../../../core/ui/notification.service';
import { localizedProblem } from '../../../core/ui/problem-detail';
import { ScrollDirective } from '../../../core/ui/scroll.directive';
import { SchedulingService } from '../scheduling/scheduling.service';
import { WorkSiteService } from '../work-sites/work-site.service';
import { Role, roleLabel } from '../roles/role.models';
import { GENDERS } from './employee-profile.models';
import { ImportIssue, ImportResponse, ImportRowRequest } from './user-import.models';
import { UserImportService } from './user-import.service';
import {
  FileProblem,
  MAX_IMPORT_ROWS,
  TemplateCatalogs,
  downloadCsvTemplate,
  downloadImportResults,
  downloadXlsxTemplate,
  readImportFile,
} from './user-import.util';

export interface UserImportData {
  assignableRoles: Role[];
}

type Step = 'select' | 'preview' | 'done';

/** Filas que se muestran en la vista previa; el resto se valida igual, solo no se pinta. */
const PREVIEW_LIMIT = 200;

/**
 * Importación masiva de usuarios (iteración 15, drawer). Tres pasos: elegir archivo (con plantilla
 * descargable), vista previa validada por el servidor y resultado. Todo o nada: con un solo error no
 * se puede confirmar. Las contraseñas temporales se entregan en un archivo que solo existe aquí, así
 * que cerrar sin descargarlo pide confirmación.
 */
@Component({
  selector: 'app-user-import-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatMenuModule, TranslocoPipe, AppNumberPipe, AlertComponent, ScrollDirective],
  styles: [
    `
      .pasos { display: flex; flex-direction: column; gap: var(--nx-space-gap-group); }
      .archivo { display: flex; flex-wrap: wrap; align-items: center; gap: var(--nx-space-gap-related); }
      .archivo input[type='file'] { display: none; }
      .nombre-archivo { overflow-wrap: anywhere; }
      ol { margin: var(--nx-space-0); padding-left: var(--nx-space-5); display: flex; flex-direction: column; gap: var(--nx-space-1); }
      td { vertical-align: top; }
      .nx-capa__pie .nx-spin { margin-right: var(--nx-space-gap-inline); vertical-align: middle; }
    `,
  ],
  template: `
    <div class="nx-capa__enc">
      <h2 class="nx-text-heading-3" mat-dialog-title>{{ 'userImport.title' | transloco }}</h2>
      <button mat-icon-button type="button" (click)="close()" [disabled]="busy()" [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
    </div>

    <div class="nx-capa__cuerpo nx-scroll pasos" nxScroll aria-live="polite">
      @if (problem()) { <app-alert tone="error">{{ problem() }}</app-alert> }

      @switch (step()) {
        @case ('select') {
          <ol class="nx-text-body">
            <li>{{ 'userImport.step1' | transloco }}</li>
            <li>{{ 'userImport.step2' | transloco: { max: maxRows } }}</li>
            <li>{{ 'userImport.step3' | transloco }}</li>
          </ol>
          <app-alert tone="info">{{ 'userImport.passwordsInfo' | transloco }}</app-alert>

          <div class="archivo">
            <button mat-stroked-button type="button" [matMenuTriggerFor]="plantilla" [disabled]="busy()">
              <mat-icon>download</mat-icon>{{ 'userImport.template' | transloco }}
            </button>
            <mat-menu #plantilla="matMenu">
              <button mat-menu-item type="button" (click)="downloadTemplate('xlsx')">{{ 'userImport.templateXlsx' | transloco }}</button>
              <button mat-menu-item type="button" (click)="downloadTemplate('csv')">{{ 'userImport.templateCsv' | transloco }}</button>
            </mat-menu>

            <input #picker type="file" accept=".csv,.xlsx" (change)="onFile(picker)" />
            <button mat-flat-button type="button" (click)="picker.click()" [disabled]="busy()" [attr.aria-busy]="busy()">
              @if (busy()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>upload_file</mat-icon> }
              {{ 'userImport.chooseFile' | transloco }}
            </button>
            @if (fileName()) { <span class="nx-text-small nx-sec nombre-archivo">{{ fileName() }}</span> }
          </div>
        }

        @case ('preview') {
          @if (report(); as r) {
            <p class="nx-text-small nx-sec nombre-archivo">{{ fileName() }}</p>
            @if (unknownColumns().length) {
              <app-alert tone="warning">{{ 'userImport.unknownColumns' | transloco: { columns: unknownColumns().join(', ') } }}</app-alert>
            }
            <dl class="nx-datos">
              <div class="nx-dato">
                <dt class="nx-text-heading-6">{{ 'userImport.rows' | transloco }}</dt>
                <dd class="nx-text-numeric">{{ r.totalRows | appNumber }}</dd>
              </div>
              <div class="nx-dato">
                <dt class="nx-text-heading-6">{{ 'userImport.seats' | transloco }}</dt>
                <dd class="nx-text-numeric">{{ 'userImport.seatsValue' | transloco: { needed: (r.seatsNeeded | appNumber), available: (r.seatsAvailable | appNumber) } }}</dd>
              </div>
            </dl>

            @if (r.valid) {
              <app-alert tone="success">{{ 'userImport.ready' | transloco: { n: r.totalRows } }}</app-alert>
              <div class="nx-tabla">
                <div class="nx-tabla__scroll nx-scroll" nxScroll>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{{ 'userImport.col.row' | transloco }}</th>
                        <th scope="col">{{ 'common.name' | transloco }}</th>
                        <th scope="col">{{ 'users.form.email' | transloco }}</th>
                        <th scope="col">{{ 'common.code' | transloco }}</th>
                        <th scope="col">{{ 'users.roles' | transloco }}</th>
                        <th scope="col">{{ 'userImport.col.shift' | transloco }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of previewRows(); track row.row) {
                        <tr>
                          <td class="nx-text-numeric">{{ row.row }}</td>
                          <td>{{ row.firstName }} {{ row.lastName }}</td>
                          <td>{{ row.email }}</td>
                          <td class="nx-text-code">{{ row.employeeCode || '—' }}</td>
                          <td>{{ rolesText(row.roles) }}</td>
                          <td>{{ row.scheduleCode ? row.scheduleCode + ' · ' + row.shiftName : '—' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
              @if (rows().length > previewLimit) {
                <p class="nx-text-small nx-sec">{{ 'userImport.previewTruncated' | transloco: { shown: previewLimit, total: rows().length } }}</p>
              }
            } @else {
              <app-alert tone="error">{{ 'userImport.hasErrors' | transloco: { n: r.issues.length } }}</app-alert>
              <div class="nx-tabla">
                <div class="nx-tabla__scroll nx-scroll" nxScroll>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{{ 'userImport.col.row' | transloco }}</th>
                        <th scope="col">{{ 'userImport.col.column' | transloco }}</th>
                        <th scope="col">{{ 'userImport.col.problem' | transloco }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (issue of r.issues; track $index) {
                        <tr>
                          <td class="nx-text-numeric">{{ issue.row || '—' }}</td>
                          <td class="nx-text-code">{{ issue.column || '—' }}</td>
                          <td>{{ issueText(issue) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }
          }
        }

        @case ('done') {
          <app-alert tone="success">{{ 'userImport.created' | transloco: { n: createdCount() } }}</app-alert>
          <app-alert tone="warning">{{ 'userImport.downloadWarning' | transloco }}</app-alert>
          <div class="archivo">
            <button mat-flat-button type="button" (click)="downloadResults()">
              <mat-icon>download</mat-icon>{{ 'userImport.downloadResults' | transloco }}
            </button>
            @if (downloaded()) { <span class="nx-text-small nx-sec">{{ 'userImport.downloaded' | transloco }}</span> }
          </div>
        }
      }
    </div>

    <div class="nx-capa__pie">
      @switch (step()) {
        @case ('select') {
          <button mat-button type="button" (click)="close()"><mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}</button>
        }
        @case ('preview') {
          <button mat-button type="button" (click)="restart()" [disabled]="busy()"><mat-icon>arrow_back</mat-icon>{{ 'userImport.otherFile' | transloco }}</button>
          <button mat-flat-button type="button" (click)="confirm()" [disabled]="busy() || !report()?.valid" [attr.aria-busy]="busy()">
            @if (busy()) { <span class="nx-spin" aria-hidden="true"></span> } @else { <mat-icon>group_add</mat-icon> }
            {{ 'userImport.confirm' | transloco: { n: rows().length } }}
          </button>
        }
        @case ('done') {
          <button mat-flat-button type="button" (click)="close()"><mat-icon>check</mat-icon>{{ 'common.close' | transloco }}</button>
        }
      }
    </div>
  `,
})
export class UserImportDialogComponent {
  private readonly importService = inject(UserImportService);
  private readonly scheduling = inject(SchedulingService);
  private readonly workSites = inject(WorkSiteService);
  private readonly auth = inject(AuthStore);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly dialogRef = inject(MatDialogRef<UserImportDialogComponent, boolean>);
  protected readonly data = inject<UserImportData>(MAT_DIALOG_DATA);

  protected readonly maxRows = MAX_IMPORT_ROWS;
  protected readonly previewLimit = PREVIEW_LIMIT;

  protected readonly step = signal<Step>('select');
  protected readonly busy = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly fileName = signal<string | null>(null);
  protected readonly rows = signal<ImportRowRequest[]>([]);
  protected readonly unknownColumns = signal<string[]>([]);
  protected readonly report = signal<ImportResponse | null>(null);
  protected readonly downloaded = signal(false);

  protected readonly previewRows = computed(() => this.rows().slice(0, PREVIEW_LIMIT));
  protected readonly createdCount = computed(() => this.report()?.created.length ?? 0);

  constructor() {
    // Sin descargar el archivo de contraseñas no se cierra por Esc ni por clic en el velo.
    this.dialogRef.disableClose = true;
    this.dialogRef.backdropClick().subscribe(() => this.close());
    this.dialogRef.keydownEvents().subscribe((e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  protected rolesText(roles: string[]): string {
    return roles.length ? roles.map(roleLabel).join(' · ') : '—';
  }

  /**
   * El mensaje del servidor llega en español con el dato concreto («ya aparece en la fila 7»); en
   * otro idioma se traduce por código y, si no hay traducción, se muestra el original.
   */
  protected issueText(issue: ImportIssue): string {
    if (this.transloco.getActiveLang() === 'es') return issue.message;
    const key = `userImport.issue.${issue.code}`;
    const text = this.transloco.translate(key);
    return text && text !== key ? text : issue.message;
  }

  protected downloadTemplate(format: 'xlsx' | 'csv'): void {
    if (format === 'csv') {
      downloadCsvTemplate();
      return;
    }
    this.busy.set(true);
    this.catalogs().subscribe((catalogs) => {
      this.busy.set(false);
      downloadXlsxTemplate(catalogs);
    });
  }

  protected async onFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = ''; // permite volver a elegir el mismo archivo tras corregirlo
    if (!file) return;
    this.problem.set(null);
    this.fileName.set(file.name);
    this.busy.set(true);

    const parsed = await readImportFile(file);
    if (parsed.problem) {
      this.busy.set(false);
      this.problem.set(this.fileProblemText(parsed.problem));
      return;
    }
    this.rows.set(parsed.rows);
    this.unknownColumns.set(parsed.unknownColumns);
    this.importService.preview(parsed.rows).subscribe({
      next: (report) => {
        this.busy.set(false);
        this.report.set(report);
        this.step.set('preview');
      },
      error: (err) => {
        this.busy.set(false);
        this.problem.set(localizedProblem(this.transloco, err, 'userImport.previewError'));
      },
    });
  }

  protected restart(): void {
    this.problem.set(null);
    this.report.set(null);
    this.rows.set([]);
    this.unknownColumns.set([]);
    this.fileName.set(null);
    this.step.set('select');
  }

  protected confirm(): void {
    this.busy.set(true);
    this.problem.set(null);
    this.importService.commit(this.rows()).subscribe({
      next: (report) => {
        this.busy.set(false);
        this.report.set(report);
        if (report.valid) {
          this.step.set('done');
          this.notify.success(this.transloco.translate('userImport.created', { n: report.created.length }));
        }
        // Si no es válido, algo cambió desde la vista previa: la tabla de errores ya lo explica.
      },
      error: (err) => {
        this.busy.set(false);
        this.problem.set(localizedProblem(this.transloco, err, 'userImport.importError'));
      },
    });
  }

  protected downloadResults(): void {
    const created = this.report()?.created ?? [];
    downloadImportResults(created);
    this.downloaded.set(true);
  }

  protected close(): void {
    if (this.busy()) return;
    const done = this.step() === 'done';
    if (!done || this.downloaded()) {
      this.dialogRef.close(done);
      return;
    }
    const data: ConfirmData = {
      title: this.transloco.translate('userImport.closeTitle'),
      message: this.transloco.translate('userImport.closeMessage'),
      confirmText: this.transloco.translate('userImport.closeAnyway'),
      color: 'warn',
    };
    this.dialog
      .open<ConfirmDialogComponent, ConfirmData, boolean>(ConfirmDialogComponent, { data })
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.dialogRef.close(true);
      });
  }

  private fileProblemText(p: FileProblem): string {
    return this.transloco.translate(`userImport.file.${p.code}`, p);
  }

  /**
   * Catálogos del tenant para la hoja «Catálogos». Horarios y centros solo si el operador tiene
   * permiso para verlos; si una consulta falla, la plantilla sale igual sin esa parte.
   */
  private catalogs(): Observable<TemplateCatalogs> {
    const roles = this.data.assignableRoles.map((r) => ({ code: r.code, label: roleLabel(r.code) }));
    const genders = GENDERS.map((g) => ({ code: g, label: this.transloco.translate(`gender.${g}`) }));

    const shifts$ = this.auth.hasPermission('schedule:manage')
      ? this.scheduling.listSchedules(0, 200).pipe(
          map((page) => page.content.filter((s) => s.status === 'ACTIVE')),
          switchMap((schedules) =>
            schedules.length
              ? forkJoin(
                  schedules.map((s) =>
                    this.scheduling.listShifts(s.id).pipe(
                      map((list) => list.map((sh) => ({ scheduleCode: s.code, scheduleName: s.name, shiftName: sh.name }))),
                    ),
                  ),
                ).pipe(map((lists) => lists.flat()))
              : of([]),
          ),
          catchError(() => of([])),
        )
      : of([]);
    const sites$ = this.auth.hasPermission('worksite:manage')
      ? this.workSites.list(0, 500).pipe(
          map((page) => page.content.filter((w) => w.status === 'ACTIVE').map((w) => ({ code: w.code, name: w.name }))),
          catchError(() => of([])),
        )
      : of([]);

    return forkJoin([shifts$, sites$]).pipe(map(([shifts, workSites]) => ({ roles, genders, shifts, workSites })));
  }
}
