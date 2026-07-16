import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SongRequestDto {
  @ApiProperty({
    description: 'Song name',
    example: 'Blinding Lights',
  })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({
    description: 'Artist name',
    example: 'The Weeknd',
  })
  @IsString()
  @MinLength(2)
  artist!: string;
}
