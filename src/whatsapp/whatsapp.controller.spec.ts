import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappController } from './whatsapp.controller';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigLoader } from '@/config/configuration';
import { MessageReceivedEvent } from './events/message-received.event';
import * as crypto from 'crypto';

const createConfig = (overrides?: Partial<{ whatsappApiToken: string; whatsappVerifyToken: string }>): ConfigLoader => ({
  whatsappApiToken: overrides?.whatsappApiToken ?? 'test-api-token',
  whatsappVerifyToken: overrides?.whatsappVerifyToken ?? 'test-verify-token',
} as unknown as ConfigLoader);

const buildReq = (overrides?: {
  requestId?: string;
  rawBody?: Buffer;
  headers?: Record<string, string | undefined>;
}): any => ({
  requestId: overrides?.requestId ?? 'req-1',
  body: overrides?.rawBody,
  headers: overrides?.headers ?? {},
});

const sign = (body: Buffer, secret: string): string =>
  'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

describe('WhatsappController', () => {
  let controller: WhatsappController;
  let emitSpy: jest.Mock;

  const messagePayload = {
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              messages: [
                { from: '2348012345678', id: 'msg-1', timestamp: '1700000000', type: 'text', text: { body: 'hello' } },
              ],
            },
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    emitSpy = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        { provide: EventEmitter2, useValue: { emit: emitSpy } },
        { provide: ConfigLoader, useValue: createConfig() },
      ],
    }).compile();

    controller = module.get(WhatsappController);
  });

  it('GET /webhook/whatsapp should verify challenge when tokens match', () => {
    const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    controller.verifyWebhook('subscribe', 'test-verify-token', 'abc123', res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('abc123');
  });

  it('GET /webhook/whatsapp should reject bad token', () => {
    const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    controller.verifyWebhook('subscribe', 'wrong', 'abc123', res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Verification failed');
  });

  it('POST should reject request when raw body is missing', async () => {
    const req = buildReq({ rawBody: undefined });
    const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    await controller.handleIncomingMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(400) as any;
    expect((res.status as jest.Mock).mock.results[0].value.send).toHaveBeenCalledWith('Invalid body');
  });

  it('POST should reject request when signature is missing', async () => {
    const raw = Buffer.from(JSON.stringify(messagePayload));
    const req = buildReq({ rawBody: raw, headers: {} });
    const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    await controller.handleIncomingMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(403) as any;
    expect((res.status as jest.Mock).mock.results[0].value.send).toHaveBeenCalledWith('Missing signature');
  });

  it('POST should reject invalid signature', async () => {
    const raw = Buffer.from(JSON.stringify(messagePayload));
    const req = buildReq({ rawBody: raw, headers: { 'x-hub-signature-256': 'sha256=bad' } });
    const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    await controller.handleIncomingMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Invalid signature');
  });

  it('POST should accept valid signature and emit MessageReceivedEvent', async () => {
    const raw = Buffer.from(JSON.stringify(messagePayload));
    const secret = 'test-api-token';
    const signature = sign(raw, secret);

    const req = buildReq({ rawBody: raw, headers: { 'x-hub-signature-256': signature } });
    const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn() };

    await controller.handleIncomingMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('EVENT_RECEIVED');

    expect(emitSpy).toHaveBeenCalledWith('message.received', expect.objectContaining({
      from: '2348012345678',
      messageId: 'msg-1',
      type: 'text',
    }));
  });

  it('POST should return 200 on parse error to avoid Meta retry storms', async () => {
    const raw = Buffer.from('not-json');
    const secret = 'test-api-token';
    const signature = sign(raw, secret);

    const req = buildReq({ rawBody: raw, headers: { 'x-hub-signature-256': signature } });
    const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn() };

    await controller.handleIncomingMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('EVENT_RECEIVED');
  });

  it('POST should tolerate mixed-case signature', async () => {
    const raw = Buffer.from(JSON.stringify(messagePayload));
    const secret = 'test-api-token';
    const signature = sign(raw, secret).toUpperCase();

    const req = buildReq({ rawBody: raw, headers: { 'x-hub-signature-256': signature } });
    const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn() };

    await controller.handleIncomingMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('EVENT_RECEIVED');
  });
});
