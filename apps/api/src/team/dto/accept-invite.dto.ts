import { IsOptional, IsString, MinLength } from "class-validator";
import { PASSWORD_MIN_LENGTH } from "../../auth/password.constants";

export class AcceptInviteDto {
  @IsString()
  token!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  password?: string;
}
