import { SetMetadata } from '@nestjs/common';

export const TENANT_REQUIRED_KEY = 'tenantRequired';
export const TenantRequired = () => SetMetadata(TENANT_REQUIRED_KEY, true);
