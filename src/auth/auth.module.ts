import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TokenService } from '../common/auth/token.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtRefreshGuard } from '../common/guards/jwt-refresh.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtAuthGuard, JwtRefreshGuard, RolesGuard],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
