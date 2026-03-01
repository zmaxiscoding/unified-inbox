import { IsString, Matches, ValidateIf } from "class-validator";

export class AssignConversationDto {
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Matches(/^c[a-z0-9]{24}$/i, { message: "membershipId must be a valid CUID" })
  membershipId!: string | null;
}
