import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkPeriodType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { CreateWorkPeriodDto } from './dto/create-work-period.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listServices(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.service.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
    );
  }

  createService(tenantId: string, dto: CreateServiceDto) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.service.create({ data: { ...dto, tenantId } }),
    );
  }

  updateService(tenantId: string, id: string, dto: UpdateServiceDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const result = await tx.service.updateMany({ where: { id, tenantId }, data: dto });
      if (result.count !== 1) throw new NotFoundException('Service not found');
      return tx.service.findFirstOrThrow({ where: { id, tenantId } });
    });
  }

  listStaff(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.staff.findMany({
        where: { tenantId },
        select: {
          id: true,
          displayName: true,
          status: true,
          color: true,
          services: {
            select: { service: { select: { id: true, name: true, durationMin: true, priceMinor: true, currency: true } } },
          },
        },
        orderBy: { displayName: 'asc' },
      }),
    );
  }

  listWorkPeriods(tenantId: string, staffId: string, from: Date, to: Date) {
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) {
      throw new BadRequestException('A valid from/to range is required');
    }
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.staffWorkPeriod.findMany({
        where: { tenantId, staffId, startsAt: { lt: to }, endsAt: { gt: from } },
        orderBy: { startsAt: 'asc' },
      }),
    );
  }

  createWorkPeriod(tenantId: string, staffId: string, dto: CreateWorkPeriodDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be later than startsAt');
    }
    return this.prisma.withTenant(tenantId, async (tx) => {
      const staff = await tx.staff.findFirst({ where: { id: staffId, tenantId }, select: { id: true } });
      if (!staff) throw new NotFoundException('Staff member not found');
      if (dto.type === WorkPeriodType.WORKING) {
        const overlap = await tx.staffWorkPeriod.findFirst({
          where: { tenantId, staffId, type: WorkPeriodType.WORKING, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
          select: { id: true },
        });
        if (overlap) throw new ConflictException('Working periods cannot overlap');
      }
      return tx.staffWorkPeriod.create({ data: { tenantId, staffId, type: dto.type, startsAt, endsAt, note: dto.note } });
    });
  }
}
