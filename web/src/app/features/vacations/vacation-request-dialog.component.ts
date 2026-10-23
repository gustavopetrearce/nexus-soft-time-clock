import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { NotificationService } from '../../core/ui/notification.service';
import { User } from '../admin/users/user.models';
import { UserService } from '../admin/users/user.service';
import { VacationService } from './vacation.service';

/**
 * Alta de una solicitud de vacaciones desde el panel (a nombre de un colaborador).
 * El backend calcula los días según la política y abre la solicitud como PENDING.
 * Requiere {@code vacation:request} (o {@code vacation:approve}).
 */
@Component({
  selector: 'app-vacation-request-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    TranslocoPipe,
  ],
  template: `
    <div class="m-head">
      <div class="badge-ic"><mat-icon>beach_access</mat-icon></div>
      <div class="t"><h2>{{ 'vacations.dialog.title' | transloco }}</h2><p>{{ 'vacations.dialog.subtitle' | transloco }}</p></div>
      <button mat-icon-button (click)="close(false)" [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
    </div>

    <form [formGroup]="form" class="m-body">
      <mat-form-field appearance="outline" class="full">
        <mat-label>{{ 'users.employee' | transloco }} *</mat-label>
        <mat-select formControlName="userId">
          @for (u of users(); track u.id) {
            <mat-option [value]="u.id">{{ u.firstName }} {{ u.lastName }}{{ u.employeeCode ? ' · ' + u.employeeCode : '' }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <div class="grid2">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'scheduling.from' | transloco }} *</mat-label>
          <input matInput type="date" formControlName="startDate" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'period.to' | transloco }} *</mat-label>
          <input matInput type="date" formControlName="endDate" />
        </mat-form-field>
      </div>
      <mat-form-field appearance="outline" class="full">
        <mat-label>{{ 'vacations.reason' | transloco }}</mat-label>
        <input matInput formControlName="reason" [placeholder]="'users.form.optional' | transloco" />
      </mat-form-field>
    </form>

    <div class="m-foot">
      <span class="fill"></span>
      <button mat-button (click)="close(false)">{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button color="primary" [disabled]="form.invalid || saving()" (click)="submit()">
        <mat-icon>check</mat-icon> {{ 'vacations.dialog.submit' | transloco }}
      </button>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .m-head { display: flex; align-items: center; gap: 14px; padding: 20px 28px 16px; border-bottom: 1px solid var(--border); }
      .m-head .badge-ic { width: 44px; height: 44px; border-radius: 12px; background: var(--brand-soft); color: var(--brand); display: grid; place-items: center; border: 1px solid var(--brand-border); flex: none; }
      .m-head .t { flex: 1; }
      .m-head h2 { margin: 0; font-size: 1.15rem; font-weight: 700; }
      .m-head p { margin: 2px 0 0; color: var(--text-muted); font-size: var(--font-small); }
      .m-body { padding: 8px 28px 12px; }
      .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 var(--sp-4); }
      mat-form-field { width: 100%; }
      .m-foot { display: flex; align-items: center; gap: 10px; padding: 14px 28px 18px; border-top: 1px solid var(--border); }
      .m-foot .fill { flex: 1; }
    `,
  ],
})
export class VacationRequestDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(VacationService);
  private readonly userService = inject(UserService);
  private readonly notify = inject(NotificationService);
  private readonly dialogRef = inject(MatDialogRef<VacationRequestDialogComponent, boolean>);
  private readonly transloco = inject(TranslocoService);

  protected readonly users = signal<User[]>([]);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    userId: ['', [Validators.required]],
    startDate: ['', [Validators.required]],
    endDate: ['', [Validators.required]],
    reason: [''],
  });

  constructor() {
    this.userService.list(0, 500).subscribe({
      next: (r) => this.users.set(r.content),
      error: () => void 0,
    });
  }

  protected close(result: boolean): void {
    this.dialogRef.close(result);
  }

  protected submit(): void {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    if (raw.endDate < raw.startDate) {
      this.notify.error(this.transloco.translate('vacations.dialog.endBeforeStart'));
      return;
    }
    this.saving.set(true);
    this.service
      .create({ userId: raw.userId, startDate: raw.startDate, endDate: raw.endDate, reason: raw.reason || undefined })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notify.success(this.transloco.translate('vacations.dialog.created'));
          this.dialogRef.close(true);
        },
        error: () => {
          this.saving.set(false);
          this.notify.error(this.transloco.translate('vacations.dialog.createError'));
        },
      });
  }
}
