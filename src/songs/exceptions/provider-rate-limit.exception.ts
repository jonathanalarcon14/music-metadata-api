import { ProviderException } from './provider.exception';
import { HttpStatus } from '@nestjs/common';

export class ProviderRateLimitException extends ProviderException {
  constructor(provider: string) {
    super(provider, 'rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
  }
}
