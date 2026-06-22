import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DealerStatus } from '../common/enums/dealer-status.enum';
import { Role } from '../common/enums/role.enum';

type QueryResultRow = Record<string, string | null>;

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

const USER_SELECT_COLUMNS = [
  'id',
  'email',
  'phone',
  'password_hash',
  'role',
  'is_verified',
  'refresh_token',
  'password_reset_token_hash',
  'password_reset_token_expires_at',
  'created_at',
  'updated_at',
].join(', ');

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private transactionStatements: string[] | null = null;

  constructor(private readonly config: ConfigService) {}

  user = {
    findUnique: async (args: FindUniqueArgs): Promise<any> => {
      const whereClause = this.buildWhereClause(args.where);
      const rows = await this.queryRows(
        `select ${USER_SELECT_COLUMNS} from users where ${whereClause} limit 1`,
      );
      const row = rows[0];
      if (!row) {
        return null;
      }
      return await this.applyUserSelect(this.mapUserRow(row), args.select);
    },

    create: async ({ data }: CreateArgs<UserCreateInput>): Promise<any> => {
      const now = new Date().toISOString();
      const user: UserRecord = {
        id: randomUUID(),
        email: data.email,
        phone: data.phone,
        passwordHash: data.passwordHash,
        role: data.role,
        isVerified: data.isVerified ?? false,
        refreshToken: null,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
        createdAt: now,
        updatedAt: now,
      };

      const sql = `
        insert into users (
          id, email, phone, password_hash, role, is_verified,
          refresh_token, password_reset_token_hash, password_reset_token_expires_at,
          created_at, updated_at
        ) values (
          ${this.literal(user.id)},
          ${this.literal(user.email)},
          ${this.literal(user.phone)},
          ${this.literal(user.passwordHash)},
          ${this.literal(user.role)},
          ${user.isVerified},
          null,
          null,
          null,
          ${this.literal(user.createdAt)},
          ${this.literal(user.updatedAt)}
        )
      `;
      await this.execute(sql);
      return this.clone(user);
    },

    update: async ({ where, data }: UpdateArgs): Promise<any> => {
      const existing = await this.user.findUnique({ where: { id: where.id } });
      if (!existing) {
        throw new Error('User not found');
      }

      const now = new Date().toISOString();
      const updateData = this.mapUserUpdateData(data);
      const sql = `update users set ${updateData ? `${updateData}, ` : ''}updated_at = ${this.literal(now)} where id = ${this.literal(where.id)}`;
      await this.execute(sql);
      return this.user.findUnique({ where: { id: where.id } });
    },

    findByPasswordResetTokenHash: async (tokenHash: string): Promise<any> => {
      const rows = await this.queryRows(
        `select ${USER_SELECT_COLUMNS} from users where password_reset_token_hash = ${this.literal(tokenHash)} limit 1`,
      );
      const row = rows[0];
      return row ? await this.applyUserSelect(this.mapUserRow(row)) : null;
    },
  };

  customerProfile = {
    create: async ({ data }: CreateArgs<CustomerProfileCreateInput>): Promise<any> => {
      const now = new Date().toISOString();
      const record: CustomerProfileRecord = {
        id: randomUUID(),
        userId: data.userId,
        fullName: data.fullName,
        address: null,
        profilePhoto: null,
        driverLicenseFrontImage: null,
        driverLicenseBackImage: null,
        createdAt: now,
        updatedAt: now,
      };

      const sql = `
        insert into customer_profiles (
          id, user_id, full_name, address, profile_photo,
          driver_license_front_image, driver_license_back_image,
          created_at, updated_at
        ) values (
          ${this.literal(record.id)},
          ${this.literal(record.userId)},
          ${this.literal(record.fullName)},
          null,
          null,
          null,
          null,
          ${this.literal(record.createdAt)},
          ${this.literal(record.updatedAt)}
        )
      `;
      await this.execute(sql);
      return this.clone(record);
    },
  };

  dealerProfile = {
    findUnique: async (args: { where: { userId: string } }): Promise<any> => {
      const rows = await this.queryRows(
        `select id, user_id, business_name, status, created_at, updated_at from dealer_profiles where user_id = ${this.literal(args.where.userId)} limit 1`,
      );
      const row = rows[0];
      return row ? this.mapDealerProfileRow(row) : null;
    },

    create: async ({ data }: CreateArgs<DealerProfileCreateInput>): Promise<any> => {
      const now = new Date().toISOString();
      const record: DealerProfileRecord = {
        id: randomUUID(),
        userId: data.userId,
        businessName: data.businessName,
        status: data.status ?? DealerStatus.PENDING_APPROVAL,
        createdAt: now,
        updatedAt: now,
      };

      const sql = `
        insert into dealer_profiles (
          id, user_id, business_name, status, created_at, updated_at
        ) values (
          ${this.literal(record.id)},
          ${this.literal(record.userId)},
          ${this.literal(record.businessName)},
          ${this.literal(record.status)},
          ${this.literal(record.createdAt)},
          ${this.literal(record.updatedAt)}
        )
      `;
      await this.execute(sql);
      return this.clone(record);
    },
  };

  async onModuleInit() {
    try {
      await this.queryRows('select 1');
    } catch {
      // Keep startup resilient in restricted test environments.
    }
  }

  async onModuleDestroy() {
    return;
  }

  async $transaction<T>(callback: (tx: PrismaService) => Promise<T>): Promise<T> {
    this.transactionStatements = [];
    try {
      const result = await callback(this);
      const statements = this.transactionStatements ?? [];
      if (statements.length > 0) {
        await this.runRaw(`begin; ${statements.join('; ')}; commit;`);
      }
      this.transactionStatements = null;
      return result;
    } catch (error) {
      this.transactionStatements = null;
      throw error;
    }
  }

  private mapUserRow(row: QueryResultRow): UserRecord {
    return {
      id: row.id ?? '',
      email: row.email ?? '',
      phone: row.phone ?? '',
      passwordHash: row.password_hash ?? '',
      role: (row.role as Role) ?? Role.CUSTOMER,
      isVerified: row.is_verified === 't' || row.is_verified === 'true',
      refreshToken: row.refresh_token,
      passwordResetTokenHash: row.password_reset_token_hash,
      passwordResetTokenExpiresAt: row.password_reset_token_expires_at,
      createdAt: row.created_at ?? '',
      updatedAt: row.updated_at ?? '',
      customerProfile: null,
      dealerProfile: null,
    };
  }

  private mapDealerProfileRow(row: QueryResultRow): DealerProfileRecord {
    return {
      id: row.id ?? '',
      userId: row.user_id ?? '',
      businessName: row.business_name ?? '',
      status: (row.status as DealerStatus) ?? DealerStatus.PENDING_APPROVAL,
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
    const rows = await this.queryRows(
      `select id, user_id, full_name, address, profile_photo, driver_license_front_image, driver_license_back_image, created_at, updated_at from customer_profiles where user_id = ${this.literal(userId)} limit 1`,
    );
    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id ?? '',
      userId: row.user_id ?? '',
      fullName: row.full_name ?? '',
      address: row.address,
      profilePhoto: row.profile_photo,
      driverLicenseFrontImage: row.driver_license_front_image,
      driverLicenseBackImage: row.driver_license_back_image,
      createdAt: row.created_at ?? '',
      updatedAt: row.updated_at ?? '',
    };
  }

  private async findDealerProfileByUserId(userId: string) {
    const rows = await this.queryRows(
      `select id, user_id, business_name, status, created_at, updated_at from dealer_profiles where user_id = ${this.literal(userId)} limit 1`,
    );
    const row = rows[0];
    return row ? this.mapDealerProfileRow(row) : null;
  }

  private buildWhereClause(where: { id?: string; email?: string; phone?: string }) {
    if (where.id) return `id = ${this.literal(where.id)}`;
    if (where.email) return `email = ${this.literal(where.email)}`;
    if (where.phone) return `phone = ${this.literal(where.phone)}`;
    throw new Error('No where clause provided');
  }

  private mapUserUpdateData(data: Partial<UserRecord>) {
    const sets: string[] = [];
    if (data.email !== undefined) sets.push(`email = ${this.literal(data.email)}`);
    if (data.phone !== undefined) sets.push(`phone = ${this.literal(data.phone)}`);
    if (data.passwordHash !== undefined)
      sets.push(`password_hash = ${this.literal(data.passwordHash)}`);
    if (data.role !== undefined) sets.push(`role = ${this.literal(data.role)}`);
    if (data.isVerified !== undefined) sets.push(`is_verified = ${data.isVerified}`);
    if (data.refreshToken !== undefined)
      sets.push(
        data.refreshToken === null
          ? 'refresh_token = null'
          : `refresh_token = ${this.literal(data.refreshToken)}`,
      );
    if (data.passwordResetTokenHash !== undefined)
      sets.push(
        data.passwordResetTokenHash === null
          ? 'password_reset_token_hash = null'
          : `password_reset_token_hash = ${this.literal(data.passwordResetTokenHash)}`,
      );
    if (data.passwordResetTokenExpiresAt !== undefined)
      sets.push(
        data.passwordResetTokenExpiresAt === null
          ? 'password_reset_token_expires_at = null'
          : `password_reset_token_expires_at = ${this.literal(
              data.passwordResetTokenExpiresAt,
            )}`,
      );

    return sets.join(', ');
  }

  private async execute(sql: string) {
    if (this.transactionStatements) {
      this.transactionStatements.push(sql);
      return;
    }

    await this.runRaw(sql);
  }

  private async queryRows(sql: string): Promise<QueryResultRow[]> {
    const output = this.runRaw(`${sql}\n`, ['-t', '-A', '-F', '\t', '-R', '\n', '-c'], true);
    const trimmed = output.trim();
    if (!trimmed) return [];

    return trimmed.split('\n').map((line) => {
      const cols = line.split('\t');
      const keys = this.extractColumnNames(sql);
      const row: QueryResultRow = {};
      keys.forEach((key, index) => {
        const value = cols[index];
        row[key] = value === '' ? null : value;
      });
      return row;
    });
  }

  private extractColumnNames(sql: string): string[] {
    const selectMatch = /^select\s+(.+?)\s+from\s+/i.exec(sql.trim());
    if (!selectMatch) {
      return [];
    }

    return selectMatch[1]
      .split(',')
      .map((column) => column.trim().split(/\s+as\s+/i).pop() ?? column.trim())
      .map((name) => name.replace(/"/g, ''));
  }

  private runRaw(
    sql: string,
    extraArgs: string[] = ['-t', '-A', '-F', '\t', '-R', '\n', '-c'],
    capture = false,
  ) {
    const databaseUrl = this.config.get<string>('DATABASE_URL');
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not configured');
    }

    const args = [databaseUrl, '-v', 'ON_ERROR_STOP=1', ...extraArgs, sql];
    const result = execFileSync('psql', args, {
      encoding: 'utf8',
      env: process.env,
      stdio: capture ? 'pipe' : 'pipe',
    });

    return String(result);
  }

  private literal(value: string) {
    return `'${value.replace(/'/g, "''")}'`;
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
