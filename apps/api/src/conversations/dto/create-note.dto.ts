import { IsString, Matches } from "class-validator";

export class CreateNoteDto {
  @IsString()
  @Matches(/\S/, { message: "body must not be blank" })
  body!: string;
}
