export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED' | 'INVITED';

export const USER_STATUSES: UserStatus[] = ['ACTIVE', 'INACTIVE', 'LOCKED', 'INVITED'];

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  employeeCode?: string;
  status: UserStatus;
  roles: string[];
}

export interface CreateUser {
  email: string;
  firstName: string;
  lastName: string;
  employeeCode?: string;
  password: string;
  roleCodes?: string[];
}

/** Filtros del listado que resuelve el servidor (además de la búsqueda). */
export interface UserListFilters {
  employeeCode?: string;
  status?: UserStatus | '';
  role?: string;
}
