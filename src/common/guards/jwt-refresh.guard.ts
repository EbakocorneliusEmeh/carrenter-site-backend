import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import { TokenPayload } from '../auth/token.service';

@Injectable()
export class JwtRefreshGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawRefreshToken = request.body?.refreshToken;

    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const payload = this.tokenService.verify<TokenPayload>(
      rawRefreshToken,
      this.config.get<string>('JWT_REFRESH_SECRET') || 'dev-refresh-secret',
    );

    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Access denied');
    }

    request.user = { ...user, rawRefreshToken };
    return true;
  }
}
