import { IsString, MinLength } from "class-validator";

export class EmailVerificationConfirmDto {
  @IsString()
  @MinLength(1)
  token!: string;
}
