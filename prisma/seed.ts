import { BillingInterval, MembershipStatus, PrismaClient, StaffStatus, TenantRole, WorkPeriodType } from '@prisma/client';
import { hash } from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seed is disabled in production');
  const passwordHash = await hash('ChangeMe123!');
  const owner = await prisma.user.upsert({
    where: { email: 'owner@beautyflow.local' },
    update: {},
    create: {
      email: 'owner@beautyflow.local',
      passwordHash,
      firstName: 'Demo',
      lastName: 'Owner',
    },
  });
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-salon' },
    update: {},
    create: { name: 'Demo Salon', slug: 'demo-salon', status: 'ACTIVE' },
  });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
    await tx.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: owner.id } },
      update: { status: MembershipStatus.ACTIVE, role: TenantRole.OWNER },
      create: { tenantId: tenant.id, userId: owner.id, status: MembershipStatus.ACTIVE, role: TenantRole.OWNER },
    });
    const service =
      (await tx.service.findFirst({ where: { tenantId: tenant.id, name: 'Demo haircut' } })) ??
      (await tx.service.create({
        data: { tenantId: tenant.id, name: 'Demo haircut', durationMin: 60, priceMinor: 250000 },
      }));
    const staff = await tx.staff.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: owner.id } },
      update: { status: StaffStatus.ACTIVE },
      create: { tenantId: tenant.id, userId: owner.id, displayName: 'Demo Master', status: StaffStatus.ACTIVE },
    });
    await tx.staffService.upsert({
      where: { staffId_serviceId: { staffId: staff.id, serviceId: service.id } },
      update: {},
      create: { tenantId: tenant.id, staffId: staff.id, serviceId: service.id },
    });
    const startsAt = new Date(Date.now() + 24 * 60 * 60_000);
    startsAt.setUTCHours(7, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 10 * 60 * 60_000);
    const period = await tx.staffWorkPeriod.findFirst({ where: { tenantId: tenant.id, staffId: staff.id, startsAt, endsAt } });
    if (!period) {
      await tx.staffWorkPeriod.create({
        data: { tenantId: tenant.id, staffId: staff.id, type: WorkPeriodType.WORKING, startsAt, endsAt },
      });
    }
  });
  await prisma.plan.upsert({
    where: { code: 'GROWTH_MONTHLY' },
    update: {},
    create: {
      code: 'GROWTH_MONTHLY',
      name: 'Growth',
      priceMinor: 349000,
      interval: BillingInterval.MONTH,
      staffLimit: 10,
      features: { onlineBooking: true, analytics: true },
    },
  });
  console.info(`Seeded tenant ${tenant.id}; login owner@beautyflow.local / ChangeMe123!`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
