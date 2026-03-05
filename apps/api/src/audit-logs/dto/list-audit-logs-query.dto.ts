import { Transform, Type } from "class-transformer";
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export class ListAuditLogsQueryDto {
  @Transform(({ value }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  action?: string;

  @Transform(({ value }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  actorId?: string;

  @Transform(({ value }) => normalizeOptionalString(value))
  @IsOptional()
  @IsDateString()
  from?: string;

  @Transform(({ value }) => normalizeOptionalString(value))
  @IsOptional()
  @IsDateString()
  to?: string;

  @Transform(({ value }) => normalizeOptionalString(value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cursor?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
