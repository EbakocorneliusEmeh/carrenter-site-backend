import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { Role } from '../common/enums/role.enum';
import { DealerStatus } from '../common/enums/dealer-status.enum';
import { createHash, pbkdf2Sync, randomBytes } from 'crypto';
import { TokenService } from '../common/auth/token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    this.assertRequiredString(dto.email, 'Email is required');
    this.assertRequiredString(dto.password, 'Password is required');
    this.assertRequiredString(dto.fullName, 'Full name is required');
    this.assertRequiredString(dto.phone, 'Phone number is required');

    const normalizedEmail = dto.email.trim().toLowerCase();
    const normalizedPhone = dto.phone.trim();
    const role = this.normalizeRole(dto.role);

    if (role === Role.ADMIN) {
      throw new BadRequestException('Admin accounts cannot be self-registered');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const existingPhone = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (existingPhone) {
      throw new ConflictException('An account with this phone number already exists');
    }

    if (role === Role.DEALER && !dto.businessName?.trim()) {
      throw new BadRequestException('Business name is required for dealer accounts');
    }

    const passwordHash = this.hashSecret(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          phone: normalizedPhone,
          passwordHash,
          role,
          isVerified: role === Role.CUSTOMER,
        },
      });

      if (newUser.role === Role.CUSTOMER) {
        await tx.customerProfile.create({
          data: {
            userId: newUser.id,
            fullName: dto.fullName.trim(),
          },
        });
      } else if (newUser.role === Role.DEALER) {
        await tx.dealerProfile.create({
          data: {
            userId: newUser.id,
            businessName: dto.businessName!.trim(),
            status: DealerStatus.PENDING_APPROVAL,
          },
        });
      }

      return newUser;
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return {
      message:
        role === Role.DEALER
          ? 'Dealer account created successfully and is pending approval'
          : 'Account created successfully',
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
      },
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    this.assertRequiredString(dto.identifier, 'Email or phone number is required');
    this.assertRequiredString(dto.password, 'Password is required');

    const identifier = dto.identifier.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: identifier },
    });

    const userByPhone =
      user ??
      (await this.prisma.user.findUnique({
        where: { phone: dto.identifier.trim() },
      }));

    if (!userByPhone) {
      throw new UnauthorizedException('Invalid email/phone or password');
    }

    if (!this.verifySecret(dto.password, userByPhone.passwordHash)) {
      throw new UnauthorizedException('Invalid email/phone or password');
    }

    if (userByPhone.role === Role.DEALER) {
      const dealerProfile = await this.prisma.dealerProfile.findUnique({
        where: { userId: userByPhone.id },
      });

      if (dealerProfile?.status === DealerStatus.SUSPENDED) {
        throw new ForbiddenException(
          'Your dealer account has been suspended. Please contact support.',
        );
      }
    }

    const tokens = await this.generateTokens(
      userByPhone.id,
      userByPhone.email,
      userByPhone.role,
    );
    await this.storeRefreshToken(userByPhone.id, tokens.refreshToken);

    return {
      message: 'Login successful',
      user: {
        id: userByPhone.id,
        email: userByPhone.email,
        phone: userByPhone.phone,
        role: userByPhone.role,
        isVerified: userByPhone.isVerified,
      },
      ...tokens,
    };
  }

  async refreshTokens(userId: string, rawRefreshToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Access denied');
    }

    const tokenMatch = this.verifySecret(rawRefreshToken, user.refreshToken);
    if (!tokenMatch) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: null,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
      },
    });

    return { message: 'Logged out successfully' };
  }

  async requestPasswordReset(dto: ForgotPasswordDto) {
    this.assertRequiredString(dto.email, 'Email is required');

    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return {
        message: 'If the email exists, a reset link has been created',
      };
    }

    const resetToken = randomBytes(32).toString('hex');
    const resetTokenHash = this.hashResetToken(resetToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: resetTokenHash,
        passwordResetTokenExpiresAt: expiresAt,
      },
    });

    return {
      message: 'Password reset link created successfully',
      resetToken,
      resetTokenExpiresAt: expiresAt,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    this.assertRequiredString(dto.token, 'Reset token is required');
    this.assertRequiredString(dto.password, 'New password is required');

    const resetTokenHash = this.hashResetToken(dto.token);
    const matchingUser = await this.prisma.user.findByPasswordResetTokenHash(
      resetTokenHash,
    );

    if (!matchingUser) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    if (
      !matchingUser.passwordResetTokenExpiresAt ||
      new Date(matchingUser.passwordResetTokenExpiresAt).getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    await this.prisma.user.update({
      where: { id: matchingUser.id },
      data: {
        passwordHash: this.hashSecret(dto.password),
        refreshToken: null,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
      },
    });

    return { message: 'Password reset successfully' };
  }

  private async generateTokens(userId: string, email: string, role: Role) {
    const accessSecret =
      this.config.get<string>('JWT_ACCESS_SECRET') || 'dev-access-secret';
    const refreshSecret =
      this.config.get<string>('JWT_REFRESH_SECRET') || 'dev-refresh-secret';

    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.signAsync(
        { sub: userId, email, role, tokenType: 'access' },
        {
          secret: accessSecret,
          expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m',
        },
      ),
      this.tokenService.signAsync(
        { sub: userId, email, role, tokenType: 'refresh' },
        {
          secret: refreshSecret,
          expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(userId: string, refreshToken: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: this.hashSecret(refreshToken) },
    });
  }

  private async findUserByResetTokenHash(resetTokenHash: string) {
    return this.prisma.user.findByPasswordResetTokenHash(resetTokenHash);
  }

  private hashSecret(value: string) {
    const saltRounds = Number(this.config.get<number>('BCRYPT_SALT_ROUNDS') || 10);
    const salt = this.config.get<string>('PASSWORD_SALT') || 'drive-now-salt';
    const derived = pbkdf2Sync(value, salt, 1000 * saltRounds, 64, 'sha512');
    return `pbkdf2$${saltRounds}$${salt}$${derived.toString('hex')}`;
  }

  private verifySecret(value: string, hashed: string) {
    const parts = hashed.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
      return false;
    }

    const saltRounds = Number(parts[1]);
    const salt = parts[2];
    const expected = parts[3];
    const derived = pbkdf2Sync(value, salt, 1000 * saltRounds, 64, 'sha512').toString(
      'hex',
    );
    return derived === expected;
  }

  private hashResetToken(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private assertRequiredString(value: string | undefined, message: string) {
    if (!value || !value.trim()) {
      throw new BadRequestException(message);
    }
  }

  private normalizeRole(input?: Role | string) {
    if (!input) {
      return Role.CUSTOMER;
    }

    const candidate = String(input).trim().toUpperCase();
    if (
      candidate !== Role.CUSTOMER &&
      candidate !== Role.DEALER &&
      candidate !== Role.ADMIN
    ) {
      throw new BadRequestException(
        'Role must be CUSTOMER, DEALER, or ADMIN',
      );
    }

    if (candidate === Role.ADMIN) {
      return Role.ADMIN;
    }

    if (candidate === Role.DEALER) {
      return Role.DEALER;
    }

    return Role.CUSTOMER;
  }
}
