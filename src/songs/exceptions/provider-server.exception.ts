import { ProviderException } from './provider.exception';
import { HttpStatus } from '@nestjs/common';

export class ProviderServerException extends ProviderException {
  constructor(provider: string) {
    super(provider, 'server error', HttpStatus.BAD_GATEWAY);
  }
}
