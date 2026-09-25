import { SetMetadata } from '@nestjs/common';
import { TenantRole } from '@prisma/client';

export const ROLES_KEY = 'tenantRoles';
export const Roles = (...roles: TenantRole[]) => SetMetadata(ROLES_KEY, roles);
