import { IsEmail } from "class-validator";

export class EmailVerificationRequestDto {
  @IsEmail()
  email!: string;
}
