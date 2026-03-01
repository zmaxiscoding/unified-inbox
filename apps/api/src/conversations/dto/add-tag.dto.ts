import { IsString, Matches } from "class-validator";

export class AddTagDto {
  @IsString()
  @Matches(/\S/, { message: "name must not be blank" })
  name!: string;
}
