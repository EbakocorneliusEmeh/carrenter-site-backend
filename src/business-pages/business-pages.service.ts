import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusinessPageDto } from './dto/create-business-page.dto';
import { UpdateBusinessPageDto } from './dto/update-business-page.dto';
import { Role } from '../common/enums/role.enum';
import { createHash } from 'crypto';

@Injectable()
export class BusinessPagesService {
  constructor(private readonly prisma: PrismaService) {}

  async createBusinessPage(userId: string, dto: CreateBusinessPageDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== Role.DEALER) {
      throw new ForbiddenException('Only dealer accounts can create business pages');
    }

    this.assertRequiredString(dto.businessName, 'Business name is required');
    this.assertRequiredString(dto.slug, 'Page slug is required');
    this.assertValidSlug(dto.slug);

    const existingPage = await this.prisma.businessPage.findUnique({
      where: { slug: dto.slug },
    });
    if (existingPage) {
      throw new ConflictException('Page slug already exists');
    }

    const page = await this.prisma.businessPage.create({
      data: {
        userId,
        businessName: dto.businessName.trim(),
        slug: dto.slug.trim().toLowerCase(),
        description: dto.description?.trim() || null,
        pagePasswordHash: dto.pagePassword
          ? this.hashPagePassword(dto.pagePassword)
          : null,
      },
    });

    return this.sanitizeBusinessPage(page);
  }

  async listBusinessPages(userId: string) {
    const pages = await this.prisma.businessPage.findManyByUserId(userId);
    return pages.map((page) => this.sanitizeBusinessPage(page));
  }

  async getBusinessPage(userId: string, pageId: string) {
    const page = await this.prisma.businessPage.findUnique({
      where: { id: pageId },
    });

    if (!page || page.userId !== userId) {
      throw new NotFoundException('Business page not found');
    }

    return this.sanitizeBusinessPage(page);
  }

  async updateBusinessPage(
    userId: string,
    pageId: string,
    dto: UpdateBusinessPageDto,
  ) {
    const existing = await this.prisma.businessPage.findUnique({
      where: { id: pageId },
    });

    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Business page not found');
    }

    const updateData: any = {};

    if (dto.businessName !== undefined) {
      if (!dto.businessName.trim()) {
        throw new BadRequestException('Business name cannot be empty');
      }
      updateData.businessName = dto.businessName.trim();
    }

    if (dto.slug !== undefined) {
      if (!dto.slug.trim()) {
        throw new BadRequestException('Page slug cannot be empty');
      }
      this.assertValidSlug(dto.slug);
      const normalizedSlug = dto.slug.trim().toLowerCase();
      if (normalizedSlug !== existing.slug) {
        const slugConflict = await this.prisma.businessPage.findUnique({
          where: { slug: normalizedSlug },
        });
        if (slugConflict) {
          throw new ConflictException('Page slug already exists');
        }
      }
      updateData.slug = normalizedSlug;
    }

    if (dto.description !== undefined) {
      updateData.description = dto.description?.trim() || null;
    }

    if (dto.pagePassword !== undefined) {
      if (!dto.pagePassword.trim()) {
        throw new BadRequestException('Page password cannot be empty');
      }
      updateData.pagePasswordHash = this.hashPagePassword(dto.pagePassword);
    }

    if (dto.status !== undefined) {
      updateData.status = dto.status;
    }

    const updated = await this.prisma.businessPage.update({
      where: { id: pageId },
      data: updateData,
    });
    return this.sanitizeBusinessPage(updated);
  }

  async deleteBusinessPage(userId: string, pageId: string) {
    const existing = await this.prisma.businessPage.findUnique({
      where: { id: pageId },
    });

    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Business page not found');
    }

    await this.prisma.businessPage.delete({ where: { id: pageId } });
    return null;
  }

  private assertRequiredString(value: string | undefined, message: string) {
    if (!value || !value.trim()) {
      throw new BadRequestException(message);
    }
  }

  private assertValidSlug(slug: string) {
    const normalized = slug.trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
      throw new BadRequestException(
        'Slug must be lowercase, alphanumeric, and may use hyphens only',
      );
    }
  }

  private hashPagePassword(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private sanitizeBusinessPage(page: { [key: string]: unknown }) {
    const { pagePasswordHash, ...safePage } = page;
    return safePage;
  }
}
