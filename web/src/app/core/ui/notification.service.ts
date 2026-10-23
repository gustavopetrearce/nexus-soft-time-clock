import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoService } from '@jsverse/transloco';

/** Avisos efímeros (éxito/error) mediante MatSnackBar, reutilizable en todas las features. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snack = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  success(message: string): void {
    this.snack.open(message, this.transloco.translate('common.ok'), { duration: 3000 });
  }

  error(message: string): void {
    this.snack.open(message, this.transloco.translate('common.close'), { duration: 6000 });
  }
}
