import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { subscriptionAllowsAccess } from '../billing/subscription.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffDto, UpdateSalonDto } from './account.dto';

const salonSelect = { id: true, name: true, slug: true, timezone: true, currency: true } satisfies Prisma.TenantSelect;
const staffSelect = {
  id: true, displayName: true, status: true,
  services: { select: { service: { select: { id: true, name: true } } } },
} satisfies Prisma.StaffSelect;

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  salon(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const salon = await tx.tenant.findUnique({ where: { id: tenantId }, select: salonSelect });
      if (!salon) throw new NotFoundException('Salon not found');
      return salon;
    });
  }

  updateSalon(tenantId: string, dto: UpdateSalonDto) {
    if (dto.name === undefined && dto.timezone === undefined) {
      throw new BadRequestException('Provide name or timezone');
    }
    return this.prisma.withTenant(tenantId, async (tx) => {
      const result = await tx.tenant.updateMany({
        where: { id: tenantId }, data: { name: dto.name, timezone: dto.timezone },
      });
      if (result.count !== 1) throw new NotFoundException('Salon not found');
      return tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: salonSelect });
    });
  }

  staff(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) => tx.staff.findMany({
      where: { tenantId }, select: staffSelect, orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    }));
  }

  createStaff(tenantId: string, dto: CreateStaffDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // Share billing's tenant lock so entitlement reads and staff counts cannot race writers.
      const tenants = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;
      if (!tenants.length) throw new NotFoundException('Salon not found');
      const subscription = await tx.subscription.findFirst({
        where: { tenantId }, orderBy: { createdAt: 'desc' }, include: { plan: true },
      });
      if (!subscription || !subscriptionAllowsAccess(subscription)) {
        throw new ForbiddenException('An active subscription is required');
      }
      const count = await tx.staff.count({ where: { tenantId } });
      if (count >= subscription.plan.staffLimit) throw new ConflictException('Current plan staff limit reached');

      const serviceIds = [...new Set(dto.serviceIds.map((id) => id.toLowerCase()))];
      const services = await tx.service.findMany({
        where: { tenantId, id: { in: serviceIds }, isActive: true }, select: { id: true },
      });
      if (services.length !== serviceIds.length) {
        throw new BadRequestException('Every serviceId must identify an active service in this salon');
      }
      const staff = await tx.staff.create({ data: { tenantId, displayName: dto.displayName } });
      if (serviceIds.length) {
        await tx.staffService.createMany({ data: serviceIds.map((serviceId) => ({ tenantId, staffId: staff.id, serviceId })) });
      }
      return tx.staff.findFirstOrThrow({ where: { id: staff.id, tenantId }, select: staffSelect });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async referral(tenantId: string) {
    const tenant = await this.salon(tenantId);
    let url: URL;
    try {
      url = new URL(this.config.getOrThrow<string>('PUBLIC_SIGNUP_URL'));
      if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) ||
        url.username || url.password) throw new Error('Invalid signup URL');
    } catch {
      throw new ServiceUnavailableException('PUBLIC_SIGNUP_URL must be configured with HTTPS (HTTP allowed for localhost)');
    }
    url.searchParams.set('ref', tenant.id);
    return { code: tenant.id, url: url.toString() };
  }
}
