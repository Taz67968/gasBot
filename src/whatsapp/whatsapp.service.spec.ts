import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappService } from './whatsapp.service';
import { ConfigLoader } from '@/config/configuration';
import axios from 'axios';

const createConfig = (overrides?: Partial<{ whatsappApiToken: string; whatsappPhoneNumberId: string }>): ConfigLoader => ({
  whatsappApiToken: overrides?.whatsappApiToken ?? 'test-api-token',
  whatsappPhoneNumberId: overrides?.whatsappPhoneNumberId ?? 'phone-number-id',
} as unknown as ConfigLoader);

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WhatsappService', () => {
  let service: WhatsappService;

  beforeEach(async () => {
    mockedAxios.create = jest.fn().mockReturnValue({
      post: jest.fn().mockResolvedValue({ data: { messages: [{ id: 'wamid' }] } }),
    } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [{ provide: ConfigLoader, useValue: createConfig() }, WhatsappService],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
  });

  it('should create axios instance with v21.0 and 30s timeout', () => {
    expect(mockedAxios.create).toHaveBeenCalledWith({
      baseURL: 'https://graph.facebook.com/v21.0',
      timeout: 30000,
      headers: {
        Authorization: 'Bearer test-api-token',
        'Content-Type': 'application/json',
      },
    });
  });

  it('should format local numbers by replacing leading 0 with country code 234', async () => {
    await service.sendText('08012345678', 'hello');

    const axiosInstance = (mockedAxios.create as jest.Mock).mock.results[0].value;
    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/phone-number-id/messages',
      expect.objectContaining({ to: '2348012345678' }),
    );
  });

  it('should leave already-valid numbers unchanged', async () => {
    await service.sendText('2348012345678', 'hello');
    const axiosInstance = (mockedAxios.create as jest.Mock).mock.results[0].value;
    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/phone-number-id/messages',
      expect.objectContaining({ to: '2348012345678' }),
    );
  });

  it('should preserve international numbers that already include a country code', async () => {
    await service.sendText('+237680123456', 'hello');
    const axiosInstance = (mockedAxios.create as jest.Mock).mock.results[0].value;
    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/phone-number-id/messages',
      expect.objectContaining({ to: '237680123456' }),
    );
  });

  it('should throw for invalid numbers', async () => {
    await expect(service.sendText('', 'hello')).rejects.toThrow('Invalid phone number');
    await expect(service.sendText('abc', 'hello')).rejects.toThrow('Invalid phone number');
  });

  it('sendInteractiveButtons should format the recipient', async () => {
    await service.sendInteractiveButtons('08012345678', 'Pick one', [{ id: '1', title: 'Yes' }]);
    const axiosInstance = (mockedAxios.create as jest.Mock).mock.results[0].value;
    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/phone-number-id/messages',
      expect.objectContaining({ to: '2348012345678' }),
    );
  });

  it('sendInteractiveList should format the recipient', async () => {
    await service.sendInteractiveList('08012345678', 'Pick one', 'View', [
      { rows: [{ id: '1', title: 'Option A' }] },
    ]);
    const axiosInstance = (mockedAxios.create as jest.Mock).mock.results[0].value;
    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/phone-number-id/messages',
      expect.objectContaining({ to: '2348012345678' }),
    );
  });

  it('sendLocationRequest should format the recipient', async () => {
    await service.sendLocationRequest('08012345678', 'Share location');
    const axiosInstance = (mockedAxios.create as jest.Mock).mock.results[0].value;
    expect(axiosInstance.post).toHaveBeenCalledWith(
      '/phone-number-id/messages',
      expect.objectContaining({ to: '2348012345678' }),
    );
  });
});
