import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

interface SesLike {
  send(command: SendEmailCommand): Promise<unknown>;
}

export class SesEmailSender implements EmailSender {
  constructor(
    private readonly client: SesLike,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [message.to] },
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: 'UTF-8' },
            Body: { Text: { Data: message.text, Charset: 'UTF-8' } },
          },
        },
      }),
    );
  }
}

export class DevLogEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.info(`[dev email] to=${message.to} subject=${message.subject}\n${message.text}`);
  }
}

export class UnconfiguredEmailSender implements EmailSender {
  async send(): Promise<void> {
    throw new Error('Email is not configured: set AWS_SES_REGION and EMAIL_FROM');
  }
}

export function createEmailSender(env: Record<string, string | undefined>): EmailSender {
  if (env.AWS_SES_REGION && env.EMAIL_FROM) {
    return new SesEmailSender(new SESv2Client({ region: env.AWS_SES_REGION }), env.EMAIL_FROM);
  }
  // Logged links carry live tokens, so only local development may fall back to the console
  return env.NODE_ENV === 'development' && !env.VERCEL ? new DevLogEmailSender() : new UnconfiguredEmailSender();
}

export function existingAccountEmail(to: string, signInUrl: string): EmailMessage {
  return {
    to,
    subject: 'Bạn đã có tài khoản Seller Advisor',
    text: [
      'Chào bạn,',
      '',
      'Ai đó (có thể là bạn) vừa đăng ký Seller Advisor bằng email này, nhưng email đã có tài khoản.',
      `Đăng nhập tại: ${signInUrl}`,
      '',
      'Nếu không phải bạn, hãy bỏ qua email này. Tài khoản của bạn không thay đổi.',
    ].join('\n'),
  };
}

export function verificationEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: 'Xác nhận email cho Seller Advisor',
    text: [
      'Chào bạn,',
      '',
      'Bấm vào liên kết dưới đây để xác nhận email và bắt đầu dùng Seller Advisor:',
      url,
      '',
      'Liên kết hết hạn sau 1 giờ. Nếu bạn không đăng ký, hãy bỏ qua email này.',
    ].join('\n'),
  };
}
