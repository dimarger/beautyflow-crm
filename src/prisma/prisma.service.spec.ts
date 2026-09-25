import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

describe('PrismaService tenant transactions', () => {
  const tenantId = '57cb71f1-9a93-4dbc-bb67-40f8b34e83b8';
  const conflict = () => new Prisma.PrismaClientKnownRequestError('Serialization failure', {
    code: 'P2034', clientVersion: '6.16.2',
  });

  function setup() {
    const tx = { $executeRaw: jest.fn().mockResolvedValue(1) };
    const transaction = jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx));
    // Exercise the method without opening a database connection.
    const service = Object.create(PrismaService.prototype) as PrismaService;
    Object.defineProperty(service, '$transaction', { value: transaction });
    return { service, transaction, tx };
  }

  it('reapplies transaction-local tenant context on every serialization retry', async () => {
    const { service, transaction, tx } = setup();
    const operation = jest.fn().mockRejectedValueOnce(conflict()).mockResolvedValue('saved');
    await expect(service.withTenant(tenantId, operation)).resolves.toBe('saved');
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw.mock.calls[0][1]).toBe(tenantId);
  });

  it('stops after three attempts and returns HTTP 409', async () => {
    const { service, transaction } = setup();
    await expect(service.withTenant(tenantId, jest.fn().mockRejectedValue(conflict())))
      .rejects.toBeInstanceOf(ConflictException);
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('does not retry validation or unrelated database errors', async () => {
    const { service, transaction } = setup();
    const error = new Error('Invalid input');
    await expect(service.withTenant(tenantId, jest.fn().mockRejectedValue(error))).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
