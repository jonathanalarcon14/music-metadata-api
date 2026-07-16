import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SongResponseDto {
  @ApiProperty({
    description: 'Song name',
    example: 'Blinding Lights',
    nullable: true,
  })
  @Expose()
  name!: string | null;

  @ApiProperty({
    description: 'Artist name',
    example: 'The Weeknd',
    nullable: true,
  })
  @Expose()
  artist!: string | null;

  @ApiProperty({
    description: 'Album name',
    example: 'After Hours',
    nullable: true,
  })
  @Expose()
  album!: string | null;

  @ApiProperty({
    description: 'Artwork URLs',
    example: ['https://...'],
    type: [String],
  })
  @Expose()
  artwork!: string[];

  @ApiProperty({
    description: 'Song lyrics',
    example: 'I been tryna call...',
    nullable: true,
  })
  @Expose()
  lyrics!: string | null;
}
