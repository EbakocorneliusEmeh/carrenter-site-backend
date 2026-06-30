import { Role } from '../../common/enums/role.enum';

export class RegisterDto {
  email!: string;
  password!: string;
  fullName!: string;
  phone!: string;
  role?: Role;
  businessName?: string;
}

export class BecomeDealerDto {
  businessName!: string;
}

export class LoginDto {
  identifier!: string;
  password!: string;
}

export class RefreshTokenDto {
  refreshToken!: string;
}

export class ForgotPasswordDto {
  email!: string;
}

export class ResetPasswordDto {
  token!: string;
  password!: string;
}
