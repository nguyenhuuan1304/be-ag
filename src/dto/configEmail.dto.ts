import { IsEmail, MaxLength, MinLength } from 'class-validator';

export class ConfigEmailDto {
  @IsEmail()
  email: string;

  @MinLength(16)
  @MaxLength(16)
  password: string;
}
