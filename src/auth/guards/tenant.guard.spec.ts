import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformRole, TenantRole } from '@prisma/client';
import { TenantGuard } from './tenant.guard';

describe('TenantGuard', () => {
  const tenantId = '57cb71f1-9a93-4dbc-bb67-40f8b34e83b8';
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) } as unknown as Reflector;

  function contextFor(header: string) {
    const request = {
      headers: { 'x-tenant-id': header },
      user: { id: 'user-1', email: 'owner@example.com', platformRole: PlatformRole.USER },
    };
    return {
      request,
      context: {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({ getRequest: () => request }),
      } as never,
    };
  }

  it('rejects a tenant without an active membership', async () => {
    const prisma = { withTenant: jest.fn().mockResolvedValue(null) };
    const guard = new TenantGuard(reflector, prisma as never);
    const { context } = contextFor(tenantId);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('attaches only the role returned for the requested tenant', async () => {
    const prisma = { withTenant: jest.fn().mockResolvedValue({ role: TenantRole.ADMIN }) };
    const guard = new TenantGuard(reflector, prisma as never);
    const { context, request } = contextFor(tenantId);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request).toMatchObject({ tenantId, tenantRole: TenantRole.ADMIN });
    expect(prisma.withTenant).toHaveBeenCalledWith(tenantId, expect.any(Function));
  });
});
