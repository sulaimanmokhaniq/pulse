import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Length } from 'class-validator';

export const RANGES = [7, 30, 90] as const;

export class TrendsQueryDto {
  @IsString()
  @Length(1, 200)
  event!: string;

  @Type(() => Number)
  @IsInt()
  @IsIn(RANGES)
  days: number = 30;
}
