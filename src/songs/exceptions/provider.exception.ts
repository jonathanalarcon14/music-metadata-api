import { HttpException, HttpStatus } from '@nestjs/common';

export class ProviderException extends HttpException {
  constructor(provider: string, message: string, status: HttpStatus) {
    super(`${provider}: ${message}`, status);
  }
}
