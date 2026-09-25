import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformRole, TenantRole } from '@prisma/client';
import { RequestContext } from '../auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<TenantRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const request = context.switchToHttp().getRequest<RequestContext>();
    if (request.user.platformRole === PlatformRole.SUPERADMIN) return true;
    if (!request.tenantRole || !roles.includes(request.tenantRole)) {
      throw new ForbiddenException('Insufficient tenant role');
    }
    return true;
  }
}
