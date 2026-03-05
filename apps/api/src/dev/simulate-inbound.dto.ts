import { IsOptional, IsString, MinLength } from "class-validator";

export class SimulateInboundDto {
  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsString()
  customerDisplay?: string;
}
