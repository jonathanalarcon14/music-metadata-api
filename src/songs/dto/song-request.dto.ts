import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SongRequestDto {
  @ApiProperty({
    description: 'Song name',
    example: 'Blinding Lights',
    maxLength: 100,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: 'Artist name',
    example: 'The Weeknd',
    maxLength: 100,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  artist!: string;
}
