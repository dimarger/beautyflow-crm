import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PlatformRole, TenantRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService regressions', () => {
  const tenantId = '57cb71f1-9a93-4dbc-bb67-40f8b34e83b8';
  const start = new Date('2030-01-02T10:00:00Z');
  const booking = {
    firstName: 'Unverified name', phone: '+79991234567',
    staffId: 'staff-a', serviceIds: ['service-a'], startsAt: start.toISOString(),
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2030-01-01T00:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  function setup() {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      customer: {
        findUnique: jest.fn().mockResolvedValue({ id: 'customer-a' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'customer-a' }),
        create: jest.fn(), update: jest.fn(),
      },
      staff: { findFirst: jest.fn().mockResolvedValue({ id: 'staff-a' }), findMany: jest.fn().mockResolvedValue([]) },
      service: { count: jest.fn().mockResolvedValue(1) },
      staffService: { findMany: jest.fn().mockResolvedValue([{
        serviceId: 'service-a', durationOverride: null, priceOverride: null,
        service: { name: 'Haircut', durationMin: 60, priceMinor: 250000, currency: 'RUB' },
      }]) },
      staffWorkPeriod: { findFirst: jest.fn().mockImplementation(async ({ where }) =>
        where.type === 'WORKING' ? { id: 'shift-a' } : null) },
      appointment: {
        findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn(),
        create: jest.fn().mockResolvedValue({
          id: 'appointment-a', status: 'PENDING', startsAt: start,
          endsAt: new Date('2030-01-02T11:00:00Z'),
          internalNotes: 'private', customer: { id: 'customer-a', notes: 'private' },
          staff: { id: 'staff-a', displayName: 'Master', userId: 'private-user' },
          items: [{ tenantId, serviceId: 'service-a', serviceName: 'Haircut', durationMin: 60, priceMinor: 250000, currency: 'RUB' }],
        }),
      },
    };
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: tenantId, status: 'ACTIVE', timezone: 'Europe/Moscow' }) },
      withTenant: jest.fn(async (_id, callback) => callback(tx)),
    };
    return { tx, service: new AppointmentsService(prisma as unknown as PrismaService) };
  }

  it('does not expose or overwrite an existing customer through public booking', async () => {
    const { service, tx } = setup();
    const result = await service.publicBook('salon-a', booking);
    expect(result).not.toHaveProperty('customer');
    expect(result).not.toHaveProperty('internalNotes');
    expect(result.staff).not.toHaveProperty('userId');
    expect(tx.customer.update).not.toHaveBeenCalled();
    expect(tx.customer.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalled();
    const data = tx.appointment.create.mock.calls[0][0].data;
    expect(data.tenantId).toBe(tenantId);
    // Prisma supplies both parent relation fields: appointmentId and tenantId.
    expect(data.items.create[0]).not.toHaveProperty('tenantId');
  });

  it('rejects an occupied interval without creating an appointment', async () => {
    const { service, tx } = setup();
    tx.appointment.findFirst.mockResolvedValue({ id: 'existing' } as never);
    await expect(service.publicBook('salon-a', booking)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.appointment.create).not.toHaveBeenCalled();
  });

  it('prevents a master from querying a colleague calendar', async () => {
    const { service, tx } = setup();
    await expect(service.calendar(tenantId,
      { id: 'user-a', email: 'master@example.com', platformRole: PlatformRole.USER },
      TenantRole.MASTER,
      { from: start.toISOString(), to: '2030-01-03T00:00:00Z', staffId: 'staff-b' },
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.appointment.findMany).not.toHaveBeenCalled();
  });

  it('does not advertise shifts beyond the booking horizon', async () => {
    const { service, tx } = setup();
    tx.staff.findMany.mockResolvedValue([{
      id: 'staff-a', displayName: 'Master',
      services: [{ durationOverride: 30, service: { durationMin: 60 } }],
      workPeriods: [{ type: 'WORKING', startsAt: new Date('2030-05-01T10:00:00Z'), endsAt: new Date('2030-05-01T12:00:00Z') }],
      appointments: [],
    }] as never);
    const result = await service.publicAvailability('salon-a', {
      from: '2030-05-01T00:00:00Z', to: '2030-05-02T00:00:00Z', serviceIds: ['service-a'],
    });
    expect(result.availability[0].slots).toEqual([]);
  });
});
