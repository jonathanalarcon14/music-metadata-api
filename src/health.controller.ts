import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Expose, plainToInstance } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ description: 'Service status', example: 'ok' })
  @Expose()
  status!: string;

  @ApiProperty({ description: 'Process uptime in seconds', example: 1234 })
  @Expose()
  uptime!: number;
}

@ApiTags('health')
// Orchestrators poll this endpoint frequently; the global throttler would
// start returning 429 and mark the instance as unhealthy.
@SkipThrottle()
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ type: HealthResponseDto })
  check(): HealthResponseDto {
    return plainToInstance(HealthResponseDto, {
      status: 'ok',
      uptime: Math.round(process.uptime()),
    });
  }
}
