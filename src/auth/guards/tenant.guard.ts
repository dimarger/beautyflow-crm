import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipStatus, PlatformRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContext } from '../auth.types';
import { TENANT_REQUIRED_KEY } from '../decorators/tenant-required.decorator';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(TENANT_REQUIRED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<RequestContext>();
    const rawTenantId = request.headers['x-tenant-id'];
    const tenantId = Array.isArray(rawTenantId) ? rawTenantId[0] : rawTenantId;
    if (!tenantId || !UUID_PATTERN.test(tenantId)) {
      throw new ForbiddenException('A valid x-tenant-id header is required');
    }

    const authorization = await this.prisma.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, status: true },
      });
      if (!tenant || tenant.status === 'SUSPENDED' || tenant.status === 'CLOSED') return null;
      if (request.user.platformRole === PlatformRole.SUPERADMIN) {
        return { role: undefined };
      }
      const membership = await tx.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId, userId: request.user.id } },
        select: { role: true, status: true },
      });
      return membership?.status === MembershipStatus.ACTIVE ? membership : null;
    });

    if (!authorization) throw new ForbiddenException('No active access to this tenant');
    request.tenantId = tenantId;
    request.tenantRole = authorization.role;
    return true;
  }
}
