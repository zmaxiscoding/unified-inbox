import { IsString, MinLength } from "class-validator";
import { PASSWORD_MIN_LENGTH } from "../password.constants";

export class PasswordResetConfirmDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  password!: string;
}
