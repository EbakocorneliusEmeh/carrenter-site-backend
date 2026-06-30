import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DealerStatus } from '../common/enums/dealer-status.enum';
import { BusinessPageStatus } from '../common/enums/business-page-status.enum';
import { Role } from '../common/enums/role.enum';

type UserRecord = {
  id: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: Role;
  isVerified: boolean;
  refreshToken: string | null;
  passwordResetTokenHash: string | null;
  passwordResetTokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  customerProfile?: CustomerProfileRecord | null;
  dealerProfile?: DealerProfileRecord | null;
};

type CustomerProfileRecord = {
  id: string;
  userId: string;
  fullName: string;
  address: string | null;
  profilePhoto: string | null;
  driverLicenseFrontImage: string | null;
  driverLicenseBackImage: string | null;
  createdAt: string;
  updatedAt: string;
};

type DealerProfileRecord = {
  id: string;
  userId: string;
  businessName: string;
  status: DealerStatus;
  createdAt: string;
  updatedAt: string;
};

type BusinessPageRecord = {
  id: string;
  userId: string;
  businessName: string;
  slug: string;
  description: string | null;
  pagePasswordHash: string | null;
  status: BusinessPageStatus;
  createdAt: string;
  updatedAt: string;
};

type SelectShape = Record<string, boolean>;

type UserCreateInput = {
  email: string;
  phone: string;
  passwordHash: string;
  role: Role;
  isVerified?: boolean;
};

type CustomerProfileCreateInput = {
  userId: string;
  fullName: string;
};

type DealerProfileCreateInput = {
  userId: string;
  businessName: string;
  status?: DealerStatus;
};

type BusinessPageCreateInput = {
  userId: string;
  businessName: string;
  slug: string;
  description?: string | null;
  pagePasswordHash?: string | null;
  status?: BusinessPageStatus;
};

type BusinessPageUpdateInput = Partial<BusinessPageCreateInput>;

type BusinessPageFindUniqueArgs = {
  where: { id?: string; slug?: string; userId?: string };
};

type FindUniqueArgs = {
  where: { id?: string; email?: string; phone?: string };
  select?: SelectShape;
};

type UpdateArgs = {
  where: { id: string };
  data: Partial<UserRecord>;
};

type CreateArgs<T> = {
  data: T;
};

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly supabase: SupabaseClient;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('SUPABASE_URL');
    const key = this.config.get<string>('SUPABASE_SECRET_KEY');

    if (!url || !key) {
      throw new Error('Supabase configuration is not set');
    }

    this.supabase = createClient(url, key);
  }

  user = {
    findUnique: async (args: FindUniqueArgs): Promise<any> => {
      const query = this.supabase.from('users').select('*');
      if (args.where.id) query.eq('id', args.where.id);
      if (args.where.email) query.eq('email', args.where.email);
      if (args.where.phone) query.eq('phone', args.where.phone);
      if (!args.where.id && !args.where.email && !args.where.phone) {
        throw new Error('No where clause provided');
      }

      const { data, error } = await query.maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      if (!data) return null;
      return await this.applyUserSelect(this.mapUserRow(data), args.select);
    },

    create: async ({ data }: CreateArgs<UserCreateInput>): Promise<any> => {
      const now = new Date().toISOString();
      const row = {
        id: randomUUID(),
        email: data.email,
        phone: data.phone,
        password_hash: data.passwordHash,
        role: data.role,
        is_verified: data.isVerified ?? false,
        refresh_token: null,
        password_reset_token_hash: null,
        password_reset_token_expires_at: null,
        created_at: now,
        updated_at: now,
      };

      const { data: inserted, error } = await this.supabase.from('users').insert(row).select().single();
      if (error) {
        throw new Error(error.message);
      }
      return this.clone(this.mapUserRow(inserted));
    },

    update: async ({ where, data }: UpdateArgs): Promise<any> => {
      const existing = await this.user.findUnique({ where: { id: where.id } });
      if (!existing) {
        throw new Error('User not found');
      }

      const updateData = this.mapUserUpdateData(data);
      if (Object.keys(updateData).length === 0) {
        return existing;
      }

      updateData.updated_at = new Date().toISOString();
      const { data: updated, error } = await this.supabase
        .from('users')
        .update(updateData)
        .eq('id', where.id)
        .select()
        .single();
      if (error) {
        throw new Error(error.message);
      }
      return await this.applyUserSelect(this.mapUserRow(updated), undefined);
    },

    findByPasswordResetTokenHash: async (tokenHash: string): Promise<any> => {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('password_reset_token_hash', tokenHash)
        .maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      if (!data) return null;
      return await this.applyUserSelect(this.mapUserRow(data));
    },
  };

  customerProfile = {
    create: async ({ data }: CreateArgs<CustomerProfileCreateInput>): Promise<any> => {
      const now = new Date().toISOString();
      const record = {
        id: randomUUID(),
        user_id: data.userId,
        full_name: data.fullName,
        address: null,
        profile_photo: null,
        driver_license_front_image: null,
        driver_license_back_image: null,
        created_at: now,
        updated_at: now,
      };

      const { data: inserted, error } = await this.supabase
        .from('customer_profiles')
        .insert(record)
        .select()
        .single();
      if (error) {
        throw new Error(error.message);
      }
      return this.clone(inserted);
    },
  };

  dealerProfile = {
    findUnique: async (args: { where: { userId: string } }): Promise<any> => {
      const { data, error } = await this.supabase
        .from('dealer_profiles')
        .select('*')
        .eq('user_id', args.where.userId)
        .maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      return data ? this.mapDealerProfileRow(data) : null;
    },

    create: async ({ data }: CreateArgs<DealerProfileCreateInput>): Promise<any> => {
      const now = new Date().toISOString();
      const record = {
        id: randomUUID(),
        user_id: data.userId,
        business_name: data.businessName,
        status: data.status ?? DealerStatus.PENDING_APPROVAL,
        created_at: now,
        updated_at: now,
      };

      const { data: inserted, error } = await this.supabase
        .from('dealer_profiles')
        .insert(record)
        .select()
        .single();
      if (error) {
        throw new Error(error.message);
      }
      return this.clone(this.mapDealerProfileRow(inserted));
    },

    update: async ({ where, data }: { where: { userId: string }; data: Partial<DealerProfileCreateInput> }): Promise<any> => {
      const existing = await this.dealerProfile.findUnique({ where: { userId: where.userId } });
      if (!existing) {
        throw new Error('Dealer profile not found');
      }

      const updateData: Record<string, unknown> = {};
      if (data.businessName !== undefined) updateData.business_name = data.businessName;
      if (data.status !== undefined) updateData.status = data.status;
      if (Object.keys(updateData).length === 0) {
        return existing;
      }

      updateData.updated_at = new Date().toISOString();
      const { data: updated, error } = await this.supabase
        .from('dealer_profiles')
        .update(updateData)
        .eq('user_id', where.userId)
        .select()
        .single();
      if (error) {
        throw new Error(error.message);
      }
      return this.mapDealerProfileRow(updated);
    },
  };

  businessPage = {
    findUnique: async (args: BusinessPageFindUniqueArgs): Promise<any> => {
      const query = this.supabase.from('business_pages').select('*');
      if (args.where.id) query.eq('id', args.where.id);
      if (args.where.slug) query.eq('slug', args.where.slug);
      if (args.where.userId) query.eq('user_id', args.where.userId);
      if (!args.where.id && !args.where.slug && !args.where.userId) {
        throw new Error('No where clause provided');
      }

      const { data, error } = await query.maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      return data ? this.mapBusinessPageRow(data) : null;
    },

    findManyByUserId: async (userId: string): Promise<any[]> => {
      const { data, error } = await this.supabase
        .from('business_pages')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) {
        throw new Error(error.message);
      }
      return (data ?? []).map((row: any) => this.mapBusinessPageRow(row));
    },

    create: async ({ data }: CreateArgs<BusinessPageCreateInput>): Promise<any> => {
      const now = new Date().toISOString();
      const record = {
        id: randomUUID(),
        user_id: data.userId,
        business_name: data.businessName,
        slug: data.slug,
        description: data.description ?? null,
        page_password_hash: data.pagePasswordHash ?? null,
        status: data.status ?? BusinessPageStatus.ACTIVE,
        created_at: now,
        updated_at: now,
      };

      const { data: inserted, error } = await this.supabase
        .from('business_pages')
        .insert(record)
        .select()
        .single();
      if (error) {
        throw new Error(error.message);
      }
      return this.clone(this.mapBusinessPageRow(inserted));
    },

    update: async ({ where, data }: { where: { id: string }; data: BusinessPageUpdateInput }): Promise<any> => {
      const existing = await this.businessPage.findUnique({ where: { id: where.id } });
      if (!existing) {
        throw new Error('Business page not found');
      }

      const updateData: Record<string, unknown> = {};
      if (data.businessName !== undefined) updateData.business_name = data.businessName;
      if (data.slug !== undefined) updateData.slug = data.slug;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.pagePasswordHash !== undefined) updateData.page_password_hash = data.pagePasswordHash;
      if (data.status !== undefined) updateData.status = data.status;
      if (Object.keys(updateData).length === 0) {
        return existing;
      }

      updateData.updated_at = new Date().toISOString();
      const { data: updated, error } = await this.supabase
        .from('business_pages')
        .update(updateData)
        .eq('id', where.id)
        .select()
        .single();
      if (error) {
        throw new Error(error.message);
      }
      return this.mapBusinessPageRow(updated);
    },

    delete: async ({ where: { id } }: { where: { id: string } }): Promise<any> => {
      const existing = await this.businessPage.findUnique({ where: { id } });
      if (!existing) {
        throw new Error('Business page not found');
      }

      const { error } = await this.supabase.from('business_pages').delete().eq('id', id).single();
      if (error) {
        throw new Error(error.message);
      }
      return existing;
    },
  };

  async onModuleInit() {
    try {
      await this.supabase.from('users').select('id').limit(1);
    } catch {
      // Keep startup resilient in restricted test environments.
    }
  }

  async onModuleDestroy() {
    return;
  }

  async $transaction<T>(callback: (tx: PrismaService) => Promise<T>): Promise<T> {
    return callback(this);
  }

  private mapUserRow(row: any): UserRecord {
    return {
      id: row.id ?? '',
      email: row.email ?? '',
      phone: row.phone ?? '',
      passwordHash: row.password_hash ?? '',
      role: (row.role as Role) ?? Role.CUSTOMER,
      isVerified: row.is_verified === true || row.is_verified === 't' || row.is_verified === 'true',
      refreshToken: row.refresh_token ?? null,
      passwordResetTokenHash: row.password_reset_token_hash ?? null,
      passwordResetTokenExpiresAt: row.password_reset_token_expires_at ?? null,
      createdAt: row.created_at ?? '',
      updatedAt: row.updated_at ?? '',
      customerProfile: null,
      dealerProfile: null,
    };
  }

  private mapDealerProfileRow(row: any): DealerProfileRecord {
    return {
      id: row.id ?? '',
      userId: row.user_id ?? '',
      businessName: row.business_name ?? '',
      status: (row.status as DealerStatus) ?? DealerStatus.PENDING_APPROVAL,
      createdAt: row.created_at ?? '',
      updatedAt: row.updated_at ?? '',
    };
  }

  private mapBusinessPageRow(row: any): BusinessPageRecord {
    return {
      id: row.id ?? '',
      userId: row.user_id ?? '',
      businessName: row.business_name ?? '',
      slug: row.slug ?? '',
      description: row.description,
      pagePasswordHash: row.page_password_hash,
      status: (row.status as BusinessPageStatus) ?? BusinessPageStatus.ACTIVE,
      createdAt: row.created_at ?? '',
      updatedAt: row.updated_at ?? '',
    };
  }

  private async applyUserSelect(user: UserRecord, select?: SelectShape) {
    const customerProfile = await this.findCustomerProfileByUserId(user.id);
    const dealerProfile = await this.findDealerProfileByUserId(user.id);
    const hydrated = {
      ...user,
      customerProfile,
      dealerProfile,
    };

    if (!select) {
      return this.clone(hydrated);
    }

    const selected: Record<string, unknown> = {};
    for (const [key, enabled] of Object.entries(select)) {
      if (!enabled) continue;
      selected[key] = (hydrated as Record<string, unknown>)[key];
    }
    return this.clone(selected);
  }

  private async findCustomerProfileByUserId(userId: string) {
    const { data, error } = await this.supabase
      .from('customer_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    if (!data) return null;

    return {
      id: data.id ?? '',
      userId: data.user_id ?? '',
      fullName: data.full_name ?? '',
      address: data.address,
      profilePhoto: data.profile_photo,
      driverLicenseFrontImage: data.driver_license_front_image,
      driverLicenseBackImage: data.driver_license_back_image,
      createdAt: data.created_at ?? '',
      updatedAt: data.updated_at ?? '',
    };
  }

  private async findDealerProfileByUserId(userId: string) {
    const { data, error } = await this.supabase
      .from('dealer_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    return data ? this.mapDealerProfileRow(data) : null;
  }

  private mapUserUpdateData(data: Partial<UserRecord>) {
    const updateData: Record<string, unknown> = {};
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.passwordHash !== undefined) updateData.password_hash = data.passwordHash;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.isVerified !== undefined) updateData.is_verified = data.isVerified;
    if (data.refreshToken !== undefined) updateData.refresh_token = data.refreshToken;
    if (data.passwordResetTokenHash !== undefined)
      updateData.password_reset_token_hash = data.passwordResetTokenHash;
    if (data.passwordResetTokenExpiresAt !== undefined)
      updateData.password_reset_token_expires_at = data.passwordResetTokenExpiresAt;
    return updateData;
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
