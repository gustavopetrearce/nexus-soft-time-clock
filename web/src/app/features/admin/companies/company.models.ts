export type CompanyStatus = 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';

export interface Company {
  id: string;
  code: string;
  name: string;
  legalName?: string;
  emailDomain?: string;
  timezone: string;
  locale: string;
  status: CompanyStatus;
}

export interface CreateCompany {
  code: string;
  name: string;
  legalName?: string;
  emailDomain?: string;
  timezone?: string;
  locale?: string;
}

export interface UpdateCompany {
  name: string;
  legalName?: string;
  emailDomain?: string;
  timezone?: string;
  locale?: string;
}

/** Alta del administrador inicial (COMPANY_ADMIN) de una empresa, hecha por el SUPER_ADMIN. */
export interface ProvisionAdmin {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  employeeCode?: string;
}

/** Usuario devuelto por el backend al aprovisionar (subset relevante). */
export interface ProvisionedAdmin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  roles: string[];
}

/**
 * Cupo de colaboradores activos de una empresa (RF-29). El límite vigente es
 * `baseLimit + extraBlocks * blockSize`; los bloques son completos y acumulativos.
 */
export interface TenantCapacity {
  companyId: string;
  baseLimit: number;
  blockSize: number;
  extraBlocks: number;
  limit: number;
  used: number;
  available: number;
}
