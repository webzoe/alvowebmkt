import type { EmailPayload, SendResult } from '../types';

export interface EmailProvider {
  getProviderName(): string;
  sendEmail(payload: EmailPayload): Promise<SendResult>;
  validateCredentials(): Promise<boolean>;
}
