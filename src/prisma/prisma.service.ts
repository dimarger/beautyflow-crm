import { ConflictException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async withTenant<T>(
    tenantId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T> {
    // Retry the entire transaction, including tenant context, with a fresh snapshot.
    // Callbacks must contain database operations only, never external side effects.
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
            return operation(tx);
          },
          options,
        );
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') {
          throw error;
        }
        if (attempt >= 2) throw new ConflictException('Concurrent modification; retry the request');
        await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
      }
    }
  }
}
