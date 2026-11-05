import type { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { describe, expect, it } from 'vitest';
import {
  createEmailSender,
  DevLogEmailSender,
  SesEmailSender,
  UnconfiguredEmailSender,
  verificationEmail,
} from './email';

describe('createEmailSender', () => {
  it('uses SES when region and sender are configured', () => {
    expect(createEmailSender({ AWS_SES_REGION: 'ap-southeast-1', EMAIL_FROM: 'no-reply@example.vn' })).toBeInstanceOf(
      SesEmailSender,
    );
  });

  it('logs to the console only in local development', () => {
    expect(createEmailSender({ NODE_ENV: 'development' })).toBeInstanceOf(DevLogEmailSender);
  });

  it.each([
    ['production without SES', { NODE_ENV: 'production' }],
    ['a Vercel preview without SES', { NODE_ENV: 'development', VERCEL: '1' }],
  ])('refuses to send in %s', async (_label, env) => {
    const sender = createEmailSender(env);
    expect(sender).toBeInstanceOf(UnconfiguredEmailSender);
    await expect(sender.send(verificationEmail('a@example.com', 'https://x'))).rejects.toThrow('Email is not configured');
  });
});

describe('SesEmailSender', () => {
  it('sends a UTF-8 plain-text email from the configured address', async () => {
    const sent: SendEmailCommand[] = [];
    const sender = new SesEmailSender({ send: async (c: SendEmailCommand) => void sent.push(c) }, 'no-reply@example.vn');
    await sender.send(verificationEmail('lan@example.com', 'https://app.example.vn/verify?token=t'));
    const input = sent[0]?.input;
    expect(input?.FromEmailAddress).toBe('no-reply@example.vn');
    expect(input?.Destination?.ToAddresses).toEqual(['lan@example.com']);
    expect(input?.Content?.Simple?.Subject?.Data).toBe('Xác nhận email cho Seller Advisor');
    expect(input?.Content?.Simple?.Body?.Text?.Data).toContain('https://app.example.vn/verify?token=t');
    expect(input?.Content?.Simple?.Body?.Text?.Charset).toBe('UTF-8');
  });
});
