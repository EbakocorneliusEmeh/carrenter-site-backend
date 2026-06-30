import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateDealerProfileDto } from './dto/dealer-profile.dto';

@Controller('user')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: any) {
    return this.usersService.findById(user.id);
  }

  @Get('dealer-profile')
  @UseGuards(JwtAuthGuard)
  getDealerProfile(@CurrentUser('id') userId: string) {
    return this.usersService.getDealerProfile(userId);
  }

  @Put('dealer-profile')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  updateDealerProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateDealerProfileDto,
  ) {
    return this.usersService.updateDealerProfile(userId, dto);
  }
}
