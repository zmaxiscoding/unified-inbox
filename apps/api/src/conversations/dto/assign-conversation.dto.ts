import { IsDefined, IsString, ValidateIf } from "class-validator";

export class AssignConversationDto {
  @IsDefined()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  membershipId!: string | null;
}
