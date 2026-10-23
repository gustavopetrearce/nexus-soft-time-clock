import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';

import { translocoTesting } from '../../../core/i18n/transloco-testing';
import { NotificationService } from '../../../core/ui/notification.service';
import { CapacityDialogComponent } from './capacity-dialog.component';
import { Company, TenantCapacity } from './company.models';
import { CompanyService } from './company.service';

describe('CapacityDialogComponent', () => {
  const company = { id: 'c-1', name: 'Empresa Demo' } as Company;

  function capacity(partial: Partial<TenantCapacity> = {}): TenantCapacity {
    return {
      companyId: company.id,
      baseLimit: 150,
      blockSize: 50,
      extraBlocks: 0,
      limit: 150,
      used: 120,
      available: 30,
      ...partial,
    };
  }

  function setup(data: { company: Company; capacity?: TenantCapacity }) {
    const service = jasmine.createSpyObj<CompanyService>('CompanyService', [
      'getCapacity',
      'setExtraBlocks',
    ]);
    const notify = jasmine.createSpyObj<NotificationService>('NotificationService', [
      'success',
      'error',
    ]);
    const dialogRef = jasmine.createSpyObj<MatDialogRef<CapacityDialogComponent>>('MatDialogRef', [
      'close',
    ]);

    TestBed.configureTestingModule({
      imports: [translocoTesting()],
      providers: [
        { provide: CompanyService, useValue: service },
        { provide: NotificationService, useValue: notify },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });

    return { service, notify, dialogRef };
  }

  function create(): CapacityDialogComponent {
    return TestBed.createComponent(CapacityDialogComponent).componentInstance;
  }

  it('reutiliza el cupo que ya trae el listado y no vuelve a pedirlo', () => {
    const { service } = setup({ company, capacity: capacity() });

    const component = create() as unknown as { blocks: () => number; loading: () => boolean };

    expect(service.getCapacity).not.toHaveBeenCalled();
    expect(component.blocks()).toBe(0);
    expect(component.loading()).toBeFalse();
  });

  it('carga el cupo cuando se abre sin él', () => {
    const { service } = setup({ company });
    service.getCapacity.and.returnValue(of(capacity({ extraBlocks: 2, limit: 250 })));

    const component = create() as unknown as { blocks: () => number; loading: () => boolean };

    expect(service.getCapacity).toHaveBeenCalledWith(company.id);
    expect(component.blocks()).toBe(2);
    expect(component.loading()).toBeFalse();
  });

  it('calcula el límite propuesto sumando bloques completos de 50', () => {
    setup({ company, capacity: capacity() });
    const component = create() as unknown as {
      step: (d: number) => void;
      proposedLimit: () => number;
      dirty: () => boolean;
    };

    expect(component.dirty()).toBeFalse();
    component.step(1);
    expect(component.proposedLimit()).toBe(200);
    component.step(1);
    expect(component.proposedLimit()).toBe(250);
    expect(component.dirty()).toBeTrue();
  });

  it('no deja bajar de cero bloques', () => {
    setup({ company, capacity: capacity() });
    const component = create() as unknown as { step: (d: number) => void; blocks: () => number };

    component.step(-1);

    expect(component.blocks()).toBe(0);
  });

  it('avisa antes de guardar cuando la reducción dejaría el límite por debajo del uso', () => {
    setup({ company, capacity: capacity({ extraBlocks: 2, limit: 250, used: 220, available: 30 }) });
    const component = create() as unknown as {
      step: (d: number) => void;
      belowUsage: () => boolean;
    };

    expect(component.belowUsage()).toBeFalse();
    component.step(-1);   // 250 → 200, con 220 activos
    expect(component.belowUsage()).toBeTrue();
  });

  it('al guardar muestra el mensaje del backend si rechaza el cambio', () => {
    const { service, notify, dialogRef } = setup({ company, capacity: capacity() });
    service.setExtraBlocks.and.returnValue(
      throwError(() => ({
        error: { code: 'CAPACITY_BELOW_USAGE', detail: 'Haga 20 baja(s) o deje 1 bloque(s).' },
      })),
    );
    const component = create() as unknown as { step: (d: number) => void; save: () => void };

    component.step(1);
    component.save();

    expect(notify.error).toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('al guardar con éxito cierra el diálogo informando el nuevo límite', () => {
    const { service, notify, dialogRef } = setup({ company, capacity: capacity() });
    service.setExtraBlocks.and.returnValue(of(capacity({ extraBlocks: 1, limit: 200 })));
    const component = create() as unknown as { step: (d: number) => void; save: () => void };

    component.step(1);
    component.save();

    expect(service.setExtraBlocks).toHaveBeenCalledWith(company.id, 1);
    expect(notify.success).toHaveBeenCalledWith('Cupo actualizado: 200 colaboradores activos.');
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('en inglés el aviso y el error del backend salen en inglés', () => {
    const { service, notify } = setup({ company, capacity: capacity() });
    TestBed.inject(TranslocoService).setActiveLang('en');
    service.setExtraBlocks.and.returnValues(
      of(capacity({ extraBlocks: 1, limit: 200 })),
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { code: 'CAPACITY_BELOW_USAGE', detail: 'Haga 20 baja(s).' },
          }),
      ),
    );
    const component = create() as unknown as { step: (d: number) => void; save: () => void };

    component.step(1);
    component.save();
    component.step(1);
    component.save();

    expect(notify.success).toHaveBeenCalledWith('Capacity updated: 200 active employees.');
    expect(notify.error).toHaveBeenCalledWith(
      'The capacity cannot be lower than the number of active employees.',
    );
  });
});
