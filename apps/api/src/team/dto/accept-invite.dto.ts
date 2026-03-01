import { IsOptional, IsString, MinLength } from "class-validator";

export class AcceptInviteDto {
  @IsString()
  token!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
