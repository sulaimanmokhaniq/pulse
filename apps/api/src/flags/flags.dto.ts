import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

export const FLAG_KEY_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

export class UpsertFlagDto {
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercent!: number;
}

export class UpdateFlagDto {
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercent?: number;
}

export class EvaluateDto {
  @IsString()
  @Length(1, 200)
  distinctId!: string;
}

export class FlagKeyParam {
  @Matches(FLAG_KEY_PATTERN, { message: 'key must be 1-64 chars: lowercase letters, digits, _ . -' })
  key!: string;
}
