import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class IdentifyRequestDto {
  @ApiPropertyOptional({
    description:
      'When false, skips metadata enrichment and returns only the identified name/artist. Useful to render results fast and enrich progressively via GET /songs/stream.',
    default: true,
  })
  @IsOptional()
  // Query params arrive as strings; anything other than "true"/"false"
  // is passed through so @IsBoolean rejects it with a 400.
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value as unknown;
  })
  @IsBoolean()
  enrich?: boolean = true;
}
