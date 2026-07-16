import { ProviderException } from './provider.exception';
import { HttpStatus } from '@nestjs/common';

export class ProviderUnauthorizedException extends ProviderException {
  constructor(provider: string) {
    super(provider, 'invalid credentials', HttpStatus.BAD_GATEWAY);
  }
}
