import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BusinessPagesService } from './business-pages.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateBusinessPageDto } from './dto/create-business-page.dto';
import { UpdateBusinessPageDto } from './dto/update-business-page.dto';

@Controller('dealer/pages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DEALER)
export class BusinessPagesController {
  constructor(private readonly businessPagesService: BusinessPagesService) {}

  @Post()
  createBusinessPage(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateBusinessPageDto,
  ) {
    return this.businessPagesService.createBusinessPage(userId, dto);
  }

  @Get()
  listBusinessPages(@CurrentUser('id') userId: string) {
    return this.businessPagesService.listBusinessPages(userId);
  }

  @Get(':id')
  getBusinessPage(
    @CurrentUser('id') userId: string,
    @Param('id') pageId: string,
  ) {
    return this.businessPagesService.getBusinessPage(userId, pageId);
  }

  @Put(':id')
  updateBusinessPage(
    @CurrentUser('id') userId: string,
    @Param('id') pageId: string,
    @Body() dto: UpdateBusinessPageDto,
  ) {
    return this.businessPagesService.updateBusinessPage(userId, pageId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteBusinessPage(
    @CurrentUser('id') userId: string,
    @Param('id') pageId: string,
  ) {
    return this.businessPagesService.deleteBusinessPage(userId, pageId);
  }
}
