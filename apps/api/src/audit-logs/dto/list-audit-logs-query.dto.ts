import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class ListAuditLogsQueryDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  action?: string;

  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsOptional()
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: "from must be a valid ISO 8601 datetime" },
  )
  from?: string;

  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsOptional()
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: "to must be a valid ISO 8601 datetime" },
  )
  to?: string;

  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cursor?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
