import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateDealerProfileDto } from './dto/dealer-profile.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        isVerified: true,
        createdAt: true,
        customerProfile: true,
        dealerProfile: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async getDealerProfile(userId: string) {
    const dealerProfile = await this.prisma.dealerProfile.findUnique({
      where: { userId },
    });

    if (!dealerProfile) {
      throw new NotFoundException('Dealer profile not found');
    }

    return dealerProfile;
  }

  async updateDealerProfile(userId: string, dto: UpdateDealerProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const dealerProfile = await this.prisma.dealerProfile.findUnique({
      where: { userId },
    });
    if (!dealerProfile) {
      throw new NotFoundException('Dealer profile not found');
    }

    if (dto.businessName !== undefined && !dto.businessName.trim()) {
      throw new BadRequestException('Business name cannot be empty');
    }

    return this.prisma.dealerProfile.update({
      where: { userId },
      data: {
        businessName: dto.businessName?.trim(),
      },
    });
  }
}
