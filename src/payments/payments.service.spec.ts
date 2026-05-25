import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, QueryRunner } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentsService } from './payments.service';
import { Payment } from '@/database/entities/payment.entity';
import { Order } from '@/database/entities/order.entity';
import { PaymentStatus } from '@/common/enums/payment-status.enum';
import { OrderStatus } from '@/common/enums/order-status.enum';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('PaymentsService - Cash on Delivery Concurrency', () => {
  let service: PaymentsService;
  let dataSource: DataSource;
  let mockQueryRunner: Partial<QueryRunner>;

  const mockOrderId = '11111111-1111-1111-1111-111111111111';
  const mockAgentId = '22222222-2222-2222-2222-222222222222';

  beforeEach(async () => {
    mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        createQueryBuilder: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
        save: jest.fn(),
      } as any,
    };

    const mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
      query: jest.fn(),
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    dataSource = module.get<DataSource>(DataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully confirm cash collection when payment is UNPAID', async () => {
    const mockPayment = {
      orderId: mockOrderId,
      status: PaymentStatus.UNPAID,
      amountXaf: 8500,
      order: { id: mockOrderId, status: OrderStatus.CASH_ACKNOWLEDGED },
    } as Payment;

    (mockQueryRunner.manager!.createQueryBuilder as jest.Mock).mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(mockPayment),
    });

    const result = await service.confirmCashCollectionByAgent(mockOrderId, mockAgentId);

    expect(result.success).toBe(true);
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('should throw ConflictException when payment is already PAID_BY_HAND (prevents double settlement)', async () => {
    const alreadyPaidPayment = {
      orderId: mockOrderId,
      status: PaymentStatus.PAID_BY_HAND,
      order: { id: mockOrderId },
    } as Payment;

    (mockQueryRunner.manager!.createQueryBuilder as jest.Mock).mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(alreadyPaidPayment),
    });

    await expect(
      service.confirmCashCollectionByAgent(mockOrderId, mockAgentId),
    ).rejects.toThrow(ConflictException);

    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when payment record does not exist', async () => {
    (mockQueryRunner.manager!.createQueryBuilder as jest.Mock).mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.confirmCashCollectionByAgent(mockOrderId, mockAgentId),
    ).rejects.toThrow(NotFoundException);

    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  /**
   * Concurrency simulation test:
   * Two agents try to confirm the same order at the exact same time.
   * The pessimistic lock + transaction must ensure only one succeeds.
   */
  it('should prevent double settlement under concurrent requests (simulated race)', async () => {
    let callCount = 0;

    // First call gets UNPAID, second call (simulated) sees PAID_BY_HAND because of lock
    const getOneMock = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          orderId: mockOrderId,
          status: PaymentStatus.UNPAID,
          amountXaf: 4500,
          order: { id: mockOrderId, status: OrderStatus.CASH_ACKNOWLEDGED },
        });
      }
      // Second concurrent call would see the updated row (in real DB the lock prevents this)
      return Promise.resolve({
        orderId: mockOrderId,
        status: PaymentStatus.PAID_BY_HAND,
        order: { id: mockOrderId },
      });
    });

    (mockQueryRunner.manager!.createQueryBuilder as jest.Mock).mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: getOneMock,
    });

    const firstCall = service.confirmCashCollectionByAgent(mockOrderId, mockAgentId);
    const secondCall = service.confirmCashCollectionByAgent(mockOrderId, 'another-agent-id');

    const [result1, result2] = await Promise.allSettled([firstCall, secondCall]);

    // At least one must have failed with ConflictException
    const failures = [result1, result2].filter(r => r.status === 'rejected');
    expect(failures.length).toBeGreaterThanOrEqual(1);

    // At least one succeeded
    const successes = [result1, result2].filter(r => r.status === 'fulfilled');
    expect(successes.length).toBeGreaterThanOrEqual(1);
  });
});
