import { ComponentType } from '@angular/cdk/portal';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';

/**
 * Drawer (DS/09 n.º 28, Estructura F): capa lateral derecha sobre MatDialog, que ya aporta velo,
 * Esc, trampa de foco y devolución del foco al cerrar. El ancho por breakpoint y la entrada
 * deslizante viven en `.nx-drawer-panel` (_material-overrides.scss).
 */
export function openDrawer<T, D = unknown, R = unknown>(
  dialog: MatDialog,
  component: ComponentType<T>,
  config: MatDialogConfig<D> = {},
): MatDialogRef<T, R> {
  return dialog.open<T, D, R>(component, {
    position: { top: '0', right: '0' },
    height: '100%',
    maxWidth: '100vw',
    maxHeight: '100vh',
    enterAnimationDuration: 0,
    panelClass: 'nx-drawer-panel',
    ...config,
  });
}
