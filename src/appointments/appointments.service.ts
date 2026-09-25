import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, Prisma, TenantRole, WorkPeriodType } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { PublicBookingDto } from './dto/public-booking.dto';

const BLOCKING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
];
const SLOT_STEP_MS = 15 * 60_000;
const MAX_BOOKING_HORIZON_MS = 90 * 86_400_000;

const STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED_BY_CLIENT, AppointmentStatus.CANCELLED_BY_SALON],
  CONFIRMED: [AppointmentStatus.CHECKED_IN, AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW, AppointmentStatus.CANCELLED_BY_CLIENT, AppointmentStatus.CANCELLED_BY_SALON],
  CHECKED_IN: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED_BY_SALON],
  COMPLETED: [],
  CANCELLED_BY_CLIENT: [],
  CANCELLED_BY_SALON: [],
  NO_SHOW: [],
};

interface BookingInput {
  customerId?: string;
  staffId: string;
  serviceIds: string[];
  startsAt: string;
  clientComment?: string;
  internalNotes?: string;
  publicCustomer?: {
    firstName: string;
    lastName?: string;
    phone: string;
    email?: string;
  };
}

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async calendar(
    tenantId: string,
    user: AuthenticatedUser,
    role: TenantRole | undefined,
    query: CalendarQueryDto,
  ) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    this.validateRange(from, to);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const staffId = await this.enforceStaffScope(tx, tenantId, user, role, query.staffId);
      return tx.appointment.findMany({
        where: { tenantId, ...(staffId ? { staffId } : {}), startsAt: { lt: to }, endsAt: { gt: from } },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
          staff: { select: { id: true, displayName: true, color: true } },
          items: true,
        },
        orderBy: { startsAt: 'asc' },
      });
    });
  }

  create(tenantId: string, dto: CreateAppointmentDto) {
    return this.createLockedAppointment(tenantId, dto, AppointmentStatus.CONFIRMED, false);
  }

  async findOne(tenantId: string, id: string, user: AuthenticatedUser, role?: TenantRole) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const appointment = await tx.appointment.findFirst({
        where: { id, tenantId },
        include: { customer: true, staff: true, items: true },
      });
      if (!appointment) throw new NotFoundException('Appointment not found');
      if (role === TenantRole.MASTER && appointment.staff.userId !== user.id) {
        throw new ForbiddenException('Masters can access only their appointments');
      }
      return appointment;
    });
  }

  async updateStatus(
    tenantId: string,
    id: string,
    nextStatus: AppointmentStatus,
    user: AuthenticatedUser,
    role?: TenantRole,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const current = await tx.appointment.findFirst({
        where: { id, tenantId },
        include: { staff: { select: { userId: true } } },
      });
      if (!current) throw new NotFoundException('Appointment not found');
      if (role === TenantRole.MASTER && current.staff.userId !== user.id) {
        throw new ForbiddenException('Masters can update only their appointments');
      }
      if (!STATUS_TRANSITIONS[current.status].includes(nextStatus)) {
        throw new ConflictException(`Invalid status transition: ${current.status} -> ${nextStatus}`);
      }
      this.validateStatusTime(current.startsAt, current.endsAt, nextStatus);
      const updated = await tx.appointment.updateMany({
        where: { id, tenantId, version: current.version },
        data: { status: nextStatus, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException('Appointment was modified concurrently');
      return tx.appointment.findFirstOrThrow({ where: { id, tenantId }, include: { items: true } });
    });
  }

  async publicServices(tenantSlug: string) {
    const tenant = await this.activeTenantBySlug(tenantSlug);
    return this.prisma.withTenant(tenant.id, (tx) =>
      tx.service.findMany({
        where: { tenantId: tenant.id, isActive: true },
        select: { id: true, name: true, description: true, durationMin: true, priceMinor: true, currency: true },
        orderBy: { name: 'asc' },
      }),
    );
  }

  async publicAvailability(tenantSlug: string, query: AvailabilityQueryDto) {
    const tenant = await this.activeTenantBySlug(tenantSlug);
    const from = new Date(query.from);
    const to = new Date(query.to);
    this.validateRange(from, to, 14);
    const now = Date.now();
    const latestStart = now + MAX_BOOKING_HORIZON_MS;
    const serviceIds = [...new Set(query.serviceIds)];

    return this.prisma.withTenant(tenant.id, async (tx) => {
      const serviceCount = await tx.service.count({
        where: { tenantId: tenant.id, id: { in: serviceIds }, isActive: true },
      });
      if (serviceCount !== serviceIds.length) throw new NotFoundException('One or more services were not found');
      const staffMembers = await tx.staff.findMany({
        where: {
          tenantId: tenant.id,
          status: 'ACTIVE',
          ...(query.staffId ? { id: query.staffId } : {}),
        },
        select: {
          id: true,
          displayName: true,
          services: {
            where: { tenantId: tenant.id, serviceId: { in: serviceIds }, service: { isActive: true } },
            include: { service: true },
          },
          workPeriods: {
            where: { tenantId: tenant.id, startsAt: { lt: to }, endsAt: { gt: from } },
            orderBy: { startsAt: 'asc' },
          },
          appointments: {
            where: { tenantId: tenant.id, status: { in: BLOCKING_STATUSES }, startsAt: { lt: to }, endsAt: { gt: from } },
            select: { startsAt: true, endsAt: true },
          },
        },
      });

      const availability = staffMembers
        .filter((staff) => staff.services.length === serviceIds.length)
        .map((staff) => {
          const durationMin = staff.services.reduce(
            (total, assignment) => total + (assignment.durationOverride ?? assignment.service.durationMin),
            0,
          );
          const unavailable = [
            ...staff.appointments,
            ...staff.workPeriods.filter((period) => period.type === WorkPeriodType.TIME_OFF),
          ];
          const slots: Array<{ startsAt: Date; endsAt: Date }> = [];
          for (const period of staff.workPeriods.filter((item) => item.type === WorkPeriodType.WORKING)) {
            const windowStart = Math.max(period.startsAt.getTime(), from.getTime(), now);
            const windowEnd = Math.min(period.endsAt.getTime(), to.getTime());
            let cursor = Math.ceil(windowStart / SLOT_STEP_MS) * SLOT_STEP_MS;
            while (cursor <= latestStart && cursor + durationMin * 60_000 <= windowEnd && slots.length < 500) {
              const slotEnd = cursor + durationMin * 60_000;
              const conflicts = unavailable.some(
                (item) => item.startsAt.getTime() < slotEnd && item.endsAt.getTime() > cursor,
              );
              if (!conflicts) slots.push({ startsAt: new Date(cursor), endsAt: new Date(slotEnd) });
              cursor += SLOT_STEP_MS;
            }
          }
          return { staffId: staff.id, staffName: staff.displayName, durationMin, slots };
        });
      return { timezone: tenant.timezone, serviceIds, availability };
    });
  }

  async publicBook(tenantSlug: string, dto: PublicBookingDto) {
    const tenant = await this.activeTenantBySlug(tenantSlug);
    return this.createLockedAppointment(
      tenant.id,
      {
        staffId: dto.staffId,
        serviceIds: dto.serviceIds,
        startsAt: dto.startsAt,
        clientComment: dto.clientComment,
        publicCustomer: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          email: dto.email,
        },
      },
      AppointmentStatus.PENDING,
      true,
    );
  }

  private async createLockedAppointment(
    tenantId: string,
    input: BookingInput,
    status: AppointmentStatus,
    publicResponse: boolean,
  ) {
    const startsAt = new Date(input.startsAt);
    const now = Date.now();
    if (!Number.isFinite(startsAt.getTime())) throw new BadRequestException('Invalid appointment start time');
    if (startsAt.getTime() < now - 60_000) throw new BadRequestException('Appointment must be in the future');
    if (startsAt.getTime() > now + MAX_BOOKING_HORIZON_MS) {
      throw new BadRequestException('Appointment cannot be more than 90 days in the future');
    }
    const serviceIds = [...new Set(input.serviceIds)];

    return this.prisma.withTenant(
      tenantId,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.staffId})::bigint)`;
        let customerId = input.customerId;
        if (input.publicCustomer) {
          const existing = await tx.customer.findUnique({
            where: { tenantId_phone: { tenantId, phone: input.publicCustomer.phone } },
            select: { id: true },
          });
          if (existing) {
            customerId = existing.id;
          } else {
            const created = await tx.customer.create({ data: { tenantId, ...input.publicCustomer }, select: { id: true } });
            customerId = created.id;
          }
        }
        if (!customerId) throw new BadRequestException('Customer is required');

        const [customer, staff, assignedServices] = await Promise.all([
          tx.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true } }),
          tx.staff.findFirst({ where: { id: input.staffId, tenantId, status: 'ACTIVE' }, select: { id: true } }),
          tx.staffService.findMany({
            where: { tenantId, staffId: input.staffId, serviceId: { in: serviceIds }, service: { isActive: true } },
            include: { service: true },
          }),
        ]);
        if (!customer) throw new NotFoundException('Customer not found');
        if (!staff) throw new NotFoundException('Staff member not found');
        if (assignedServices.length !== serviceIds.length) {
          throw new BadRequestException('One or more services are unavailable for this staff member');
        }
        const durationMin = assignedServices.reduce(
          (total, item) => total + (item.durationOverride ?? item.service.durationMin),
          0,
        );
        const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
        const [workingPeriod, timeOff, overlap] = await Promise.all([
          tx.staffWorkPeriod.findFirst({
            where: { tenantId, staffId: input.staffId, type: WorkPeriodType.WORKING, startsAt: { lte: startsAt }, endsAt: { gte: endsAt } },
            select: { id: true },
          }),
          tx.staffWorkPeriod.findFirst({
            where: { tenantId, staffId: input.staffId, type: WorkPeriodType.TIME_OFF, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
            select: { id: true },
          }),
          tx.appointment.findFirst({
            where: { tenantId, staffId: input.staffId, status: { in: BLOCKING_STATUSES }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
            select: { id: true },
          }),
        ]);
        if (!workingPeriod || timeOff) throw new ConflictException('The selected time is outside working hours');
        if (overlap) throw new ConflictException('The selected time is no longer available');

        const appointment = await tx.appointment.create({
          data: {
            tenantId,
            customerId,
            staffId: input.staffId,
            status,
            startsAt,
            endsAt,
            clientComment: input.clientComment,
            internalNotes: input.internalNotes,
            items: {
              create: assignedServices.map((item) => ({
                serviceId: item.serviceId,
                serviceName: item.service.name,
                durationMin: item.durationOverride ?? item.service.durationMin,
                priceMinor: item.priceOverride ?? item.service.priceMinor,
                currency: item.service.currency,
              })),
            },
          },
          include: { customer: true, staff: true, items: true },
        });
        if (!publicResponse) return appointment;
        return {
          id: appointment.id,
          status: appointment.status,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          staff: { id: appointment.staff.id, displayName: appointment.staff.displayName },
          items: appointment.items.map((item) => ({
            serviceId: item.serviceId,
            serviceName: item.serviceName,
            durationMin: item.durationMin,
            priceMinor: item.priceMinor,
            currency: item.currency,
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async enforceStaffScope(
    tx: Prisma.TransactionClient,
    tenantId: string,
    user: AuthenticatedUser,
    role: TenantRole | undefined,
    requestedStaffId?: string,
  ): Promise<string | undefined> {
    if (role !== TenantRole.MASTER) return requestedStaffId;
    const staff = await tx.staff.findFirst({
      where: { tenantId, userId: user.id, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!staff) throw new ForbiddenException('No active staff profile');
    if (requestedStaffId && requestedStaffId !== staff.id) {
      throw new ForbiddenException('Masters can access only their calendar');
    }
    return staff.id;
  }

  private async activeTenantBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, timezone: true, status: true },
    });
    if (!tenant || !['TRIAL', 'ACTIVE'].includes(tenant.status)) throw new NotFoundException('Salon not found');
    return tenant;
  }

  private validateRange(from: Date, to: Date, maxDays = 93): void {
    const duration = to.getTime() - from.getTime();
    if (!Number.isFinite(duration) || duration <= 0) throw new BadRequestException('to must be later than from');
    if (duration > maxDays * 86_400_000) throw new BadRequestException(`Range cannot exceed ${maxDays} days`);
  }

  private validateStatusTime(startsAt: Date, endsAt: Date, status: AppointmentStatus): void {
    const now = Date.now();
    if (status === AppointmentStatus.CHECKED_IN && now < startsAt.getTime() - 30 * 60_000) {
      throw new ConflictException('Check-in is available no earlier than 30 minutes before the appointment');
    }
    if (status === AppointmentStatus.COMPLETED && now < endsAt.getTime()) {
      throw new ConflictException('Appointment cannot be completed before its end time');
    }
    if (status === AppointmentStatus.NO_SHOW && now < startsAt.getTime() + 15 * 60_000) {
      throw new ConflictException('No-show can be set 15 minutes after the start time');
    }
  }
}
