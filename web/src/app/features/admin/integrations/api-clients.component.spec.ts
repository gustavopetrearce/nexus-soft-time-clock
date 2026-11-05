import { Clipboard } from '@angular/cdk/clipboard';
import { registerLocaleData } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import localeEs from '@angular/common/locales/es';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { ConfirmDialogComponent } from '../../../core/ui/confirm-dialog.component';
import { translocoTesting } from '../../../core/i18n/transloco-testing';
import { NotificationService } from '../../../core/ui/notification.service';
import { ApiClientFormDialogComponent } from './api-client-form-dialog.component';
import { ApiClientSecretDialogComponent } from './api-client-secret-dialog.component';
import { ApiClient, ApiClientCredentials, basicAuthorization } from './api-client.models';
import { ApiClientService } from './api-client.service';
import { ApiClientsComponent } from './api-clients.component';

const CREDENTIALS: ApiClientCredentials = { id: 'c-1', clientId: 'nxc_abc', clientSecret: 's3cr3t', name: 'Reloj 1' };

function apiClient(partial: Partial<ApiClient> = {}): ApiClient {
  return { id: 'c-1', clientId: 'nxc_abc', name: 'Reloj 1', status: 'ACTIVE', createdAt: '2026-11-05T12:00:00Z', ...partial };
}

describe('basicAuthorization', () => {
  it('codifica client_id:client_secret en Base64', () => {
    expect(basicAuthorization(CREDENTIALS)).toBe(`Basic ${btoa('nxc_abc:s3cr3t')}`);
  });
});

describe('ApiClientsComponent', () => {
  beforeAll(() => registerLocaleData(localeEs));

  function setup(clients: ApiClient[], dialogResult: unknown = undefined) {
    const service = jasmine.createSpyObj<ApiClientService>('ApiClientService', ['list', 'create', 'rotateSecret', 'revoke']);
    service.list.and.returnValue(of(clients));
    const notify = jasmine.createSpyObj<NotificationService>('NotificationService', ['success', 'error']);
    const dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    dialog.open.and.returnValue({ afterClosed: () => of(dialogResult) } as never);

    TestBed.configureTestingModule({
      imports: [translocoTesting()],
      providers: [
        { provide: ApiClientService, useValue: service },
        { provide: NotificationService, useValue: notify },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(ApiClientsComponent);
    fixture.detectChanges();
    return { fixture, service, notify, dialog, el: fixture.nativeElement as HTMLElement };
  }

  function rowButtons(el: HTMLElement): HTMLButtonElement[] {
    return Array.from(el.querySelectorAll<HTMLButtonElement>('tbody button'));
  }

  it('una credencial activa ofrece rotar y revocar', () => {
    const { el } = setup([apiClient()]);

    expect(rowButtons(el).length).toBe(2);
  });

  it('una credencial revocada no ofrece acciones', () => {
    const { el } = setup([apiClient({ status: 'REVOKED' })]);

    expect(el.querySelector('tbody tr')).not.toBeNull();
    expect(rowButtons(el).length).toBe(0);
  });

  it('nunca pinta el secreto en el listado', () => {
    const { el } = setup([{ ...apiClient(), clientSecret: 's3cr3t' } as ApiClient]);

    expect(el.textContent).not.toContain('s3cr3t');
  });

  it('sin credenciales muestra el estado vacío', () => {
    const { el } = setup([]);

    expect(el.querySelector('table')).toBeNull();
    expect(el.querySelector('app-empty-state')).not.toBeNull();
  });

  it('al crear muestra el secreto en un diálogo que no se cierra por accidente', () => {
    const { fixture, dialog, service } = setup([], CREDENTIALS);

    (fixture.componentInstance as unknown as { create(): void }).create();

    expect(dialog.open.calls.argsFor(0)[0]).toBe(ApiClientFormDialogComponent);
    expect(dialog.open.calls.argsFor(1)[0]).toBe(ApiClientSecretDialogComponent);
    expect(dialog.open.calls.argsFor(1)[1]).toEqual(
      jasmine.objectContaining({ data: { credentials: CREDENTIALS, rotated: false }, disableClose: true }),
    );
    expect(service.list).toHaveBeenCalledTimes(2);
  });

  it('cancelar la creación no abre el secreto', () => {
    const { fixture, dialog } = setup([], undefined);

    (fixture.componentInstance as unknown as { create(): void }).create();

    expect(dialog.open).toHaveBeenCalledTimes(1);
  });

  it('no rota sin confirmar', () => {
    const { el, service, dialog } = setup([apiClient()], false);

    rowButtons(el)[0].click();

    expect(dialog.open.calls.argsFor(0)[0]).toBe(ConfirmDialogComponent);
    expect(service.rotateSecret).not.toHaveBeenCalled();
  });

  it('rotar confirmado muestra el secreto nuevo', () => {
    const { el, service, dialog } = setup([apiClient()], true);
    service.rotateSecret.and.returnValue(of(CREDENTIALS));

    rowButtons(el)[0].click();

    expect(service.rotateSecret).toHaveBeenCalledOnceWith('c-1');
    expect(dialog.open.calls.mostRecent().args[0]).toBe(ApiClientSecretDialogComponent);
    expect(dialog.open.calls.mostRecent().args[1]).toEqual(
      jasmine.objectContaining({ data: { credentials: CREDENTIALS, rotated: true } }),
    );
  });

  it('no revoca sin confirmar', () => {
    const { el, service } = setup([apiClient()], false);

    rowButtons(el)[1].click();

    expect(service.revoke).not.toHaveBeenCalled();
  });

  it('revocar confirmado refresca la lista', () => {
    const { el, service, notify } = setup([apiClient()], true);
    service.revoke.and.returnValue(of(undefined));

    rowButtons(el)[1].click();

    expect(service.revoke).toHaveBeenCalledOnceWith('c-1');
    expect(notify.success).toHaveBeenCalled();
    expect(service.list).toHaveBeenCalledTimes(2);
  });

  it('un error al rotar se muestra y refresca, sin abrir el secreto', () => {
    const { el, service, notify, dialog } = setup([apiClient()], true);
    service.rotateSecret.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'API_CLIENT_REVOKED', detail: 'La credencial está revocada.' } })),
    );

    rowButtons(el)[0].click();

    expect(notify.error).toHaveBeenCalledWith('La credencial está revocada.');
    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(service.list).toHaveBeenCalledTimes(2);
  });
});

describe('ApiClientFormDialogComponent', () => {
  function setup() {
    const service = jasmine.createSpyObj<ApiClientService>('ApiClientService', ['create']);
    const dialogRef = jasmine.createSpyObj<MatDialogRef<ApiClientFormDialogComponent>>('MatDialogRef', ['close']);
    TestBed.configureTestingModule({
      imports: [translocoTesting()],
      providers: [
        provideNoopAnimations(),
        { provide: ApiClientService, useValue: service },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });
    const fixture = TestBed.createComponent(ApiClientFormDialogComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const type = (value: string) => {
      const input = el.querySelector('input') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const submit = () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
    };
    return { fixture, service, dialogRef, el, type, submit };
  }

  it('recorta el nombre y se cierra con las credenciales', () => {
    const { service, dialogRef, type, submit } = setup();
    service.create.and.returnValue(of(CREDENTIALS));

    type('  Reloj 1  ');
    submit();

    expect(service.create).toHaveBeenCalledOnceWith('Reloj 1');
    expect(dialogRef.close).toHaveBeenCalledOnceWith(CREDENTIALS);
  });

  it('no envía un nombre en blanco', () => {
    const { service, type, submit } = setup();

    type('   ');
    submit();

    expect(service.create).not.toHaveBeenCalled();
  });

  it('un nombre repetido deja el diálogo abierto con el motivo', () => {
    const { service, dialogRef, el, type, submit } = setup();
    service.create.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'API_CLIENT_NAME_TAKEN', detail: 'Ya existe una credencial con ese nombre.' } })),
    );

    type('Reloj 1');
    submit();

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Ya existe una credencial con ese nombre.');
  });
});

describe('ApiClientSecretDialogComponent', () => {
  function setup(rotated = false, copied = true) {
    const clipboard = jasmine.createSpyObj<Clipboard>('Clipboard', ['copy']);
    clipboard.copy.and.returnValue(copied);
    const notify = jasmine.createSpyObj<NotificationService>('NotificationService', ['success', 'error']);
    TestBed.configureTestingModule({
      imports: [translocoTesting()],
      providers: [
        { provide: Clipboard, useValue: clipboard },
        { provide: NotificationService, useValue: notify },
        { provide: MatDialogRef, useValue: jasmine.createSpyObj('MatDialogRef', ['close']) },
        { provide: MAT_DIALOG_DATA, useValue: { credentials: CREDENTIALS, rotated } },
      ],
    });
    const fixture = TestBed.createComponent(ApiClientSecretDialogComponent);
    fixture.detectChanges();
    return { clipboard, notify, el: fixture.nativeElement as HTMLElement };
  }

  it('muestra el id, el secreto y la cabecera lista para el reloj', () => {
    const { el } = setup();

    expect(el.textContent).toContain('nxc_abc');
    expect(el.textContent).toContain('s3cr3t');
    expect(el.textContent).toContain(`Authorization: Basic ${btoa('nxc_abc:s3cr3t')}`);
  });

  it('copia el valor elegido y avisa', () => {
    const { el, clipboard, notify } = setup();

    el.querySelectorAll<HTMLButtonElement>('.valor button')[1].click();

    expect(clipboard.copy).toHaveBeenCalledOnceWith('s3cr3t');
    expect(notify.success).toHaveBeenCalled();
  });

  it('si el navegador bloquea la copia, lo dice', () => {
    const { el, notify } = setup(false, false);

    el.querySelector<HTMLButtonElement>('.valor button')?.click();

    expect(notify.error).toHaveBeenCalled();
    expect(notify.success).not.toHaveBeenCalled();
  });
});
