import type { MailerooCredentials, RawCredentials, SmtpCredentials } from '../types';
import type { EmailProvider } from './interface';
import { MailerooProvider, type MailerooBodyMode, DEFAULT_BODY_MODE } from './maileroo';
import { SmtpProvider } from './smtp';

export function createProvider(
  providerType: string,
  credentials: RawCredentials,
  options?: { mailerooBodyMode?: string },
): EmailProvider {
  switch (providerType) {
    case 'maileroo_api': {
      const { api_key } = credentials as MailerooCredentials;
      const mode = (options?.mailerooBodyMode ?? DEFAULT_BODY_MODE) as MailerooBodyMode;
      return new MailerooProvider(api_key, mode);
    }
    case 'smtp': {
      return new SmtpProvider(credentials as SmtpCredentials);
    }
    default:
      throw new Error(`Unknown provider type: ${providerType}`);
  }
}
