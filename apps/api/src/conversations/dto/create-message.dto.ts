import { IsString, Matches } from "class-validator";

export class CreateMessageDto {
  @IsString()
  @Matches(/\S/, { message: "text must not be blank" })
  text!: string;
}
