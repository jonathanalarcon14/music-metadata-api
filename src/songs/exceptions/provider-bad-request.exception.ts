import { ProviderException } from './provider.exception';
import { HttpStatus } from '@nestjs/common';

export class ProviderBadRequestException extends ProviderException {
  constructor(provider: string) {
    super(provider, 'bad request', HttpStatus.BAD_GATEWAY);
  }
}
