import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BusinessPagesController } from './business-pages.controller';
import { BusinessPagesService } from './business-pages.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [BusinessPagesController],
  providers: [BusinessPagesService],
})
export class BusinessPagesModule {}
