import { IsEmail, IsString, MinLength } from "class-validator";
import { PASSWORD_MIN_LENGTH } from "../password.constants";

export class BootstrapOwnerDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  password!: string;

  @IsString()
  @MinLength(1)
  organizationName!: string;
}
