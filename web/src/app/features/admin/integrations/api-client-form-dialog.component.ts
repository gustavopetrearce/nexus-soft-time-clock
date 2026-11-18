import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AlertComponent } from '../../../core/ui/alert.component';
import { LoadingBarComponent } from '../../../core/ui/loading-bar.component';
import { localizedProblem } from '../../../core/ui/problem-detail';
import { ApiClientCredentials } from './api-client.models';
import { ApiClientService } from './api-client.service';

/**
 * Alta de una credencial (Drawer, como las altas del catálogo; sin maqueta propia): solo pide el nombre. Se cierra con la respuesta para que el listado
 * muestre el secreto; un nombre repetido se queda abierto con el motivo.
 */
@Component({
  selector: 'app-api-client-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslocoPipe,
    AlertComponent,
    LoadingBarComponent,
  ],
  styles: [`h2 { margin: var(--nx-space-0); } mat-form-field { width: 100%; } form { display: flex; flex-direction: column; flex: 1; min-height: var(--nx-space-0); }`],
  template: `
    <form [formGroup]="form" (ngSubmit)="save()">
      <div class="nx-capa__enc">
        <h2 class="nx-text-heading-3" mat-dialog-title>{{ 'apiClients.new' | transloco }}</h2>
        <button mat-icon-button type="button" [disabled]="saving()" (click)="dialogRef.close()" [attr.aria-label]="'common.close' | transloco"><mat-icon>close</mat-icon></button>
      </div>
      <div class="nx-capa__cuerpo" aria-live="polite">
        <app-loading-bar [active]="saving()" />
        @if (error()) {
          <app-alert tone="error">{{ error() }}</app-alert>
        }
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'common.name' | transloco }}</mat-label>
          <input matInput [formControl]="name" maxlength="120" autocomplete="off" cdkFocusInitial />
          <mat-hint>{{ 'apiClients.nameHint' | transloco }}</mat-hint>
        </mat-form-field>
      </div>
      <div class="nx-capa__pie">
        <button mat-button type="button" [disabled]="saving()" (click)="dialogRef.close()"><mat-icon>close</mat-icon>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="saving()" [attr.aria-busy]="saving()">
          <mat-icon>vpn_key</mat-icon>{{ 'apiClients.generate' | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class ApiClientFormDialogComponent {
  private readonly service = inject(ApiClientService);
  private readonly transloco = inject(TranslocoService);
  protected readonly dialogRef = inject(MatDialogRef<ApiClientFormDialogComponent, ApiClientCredentials>);

  protected readonly name = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  protected readonly form = new FormGroup({ name: this.name });
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected save(): void {
    const name = this.name.value.trim();
    if (this.saving()) return;
    if (!name) {
      // El botón nunca se deshabilita antes del primer intento: el error aparece al enviar (C1, C2).
      this.name.setValue('');
      this.name.markAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.service.create(name).subscribe({
      next: (credentials) => this.dialogRef.close(credentials),
      error: (err) => {
        this.error.set(localizedProblem(this.transloco, err, 'apiClients.createError'));
        this.saving.set(false);
      },
    });
  }
}
