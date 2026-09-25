import { PlatformRole, TenantRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  platformRole: PlatformRole;
}

export interface RequestContext {
  user: AuthenticatedUser;
  tenantId?: string;
  tenantRole?: TenantRole;
  headers: Record<string, string | string[] | undefined>;
}
