import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export type TokenType = 'access' | 'refresh';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  tokenType: TokenType;
  iat: number;
  exp: number;
}

interface SignOptions {
  secret: string;
  expiresIn: string | number;
}

@Injectable()
export class TokenService {
  async signAsync(
    payload: Omit<TokenPayload, 'iat' | 'exp'>,
    options: SignOptions,
  ): Promise<string> {
    const issuedAt = Math.floor(Date.now() / 1000);
    const exp = issuedAt + this.parseExpiresIn(options.expiresIn);
    const tokenPayload: TokenPayload = {
      ...payload,
      iat: issuedAt,
      exp,
    };

    const header = this.base64UrlEncode(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    );
    const body = this.base64UrlEncode(JSON.stringify(tokenPayload));
    const signature = this.sign(`${header}.${body}`, options.secret);
    return `${header}.${body}.${signature}`;
  }

  verify<T extends TokenPayload>(token: string, secret: string): T {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid token');
    }

    const [header, body, signature] = parts;
    const expectedSignature = this.sign(`${header}.${body}`, secret);
    if (!this.safeCompare(signature, expectedSignature)) {
      throw new UnauthorizedException('Invalid token signature');
    }

    const payload = JSON.parse(this.base64UrlDecode(body)) as T;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp <= now) {
      throw new UnauthorizedException('Token expired');
    }

    return payload;
  }

  private sign(input: string, secret: string): string {
    return this.base64UrlEncode(
      createHmac('sha256', secret).update(input).digest(),
    );
  }

  private parseExpiresIn(value: string | number): number {
    if (typeof value === 'number') {
      return value;
    }

    const match = /^(\d+)([smhd])$/.exec(value.trim());
    if (!match) {
      throw new Error(`Invalid expiresIn value: ${value}`);
    }

    const amount = Number(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's':
        return amount;
      case 'm':
        return amount * 60;
      case 'h':
        return amount * 60 * 60;
      case 'd':
        return amount * 60 * 60 * 24;
      default:
        throw new Error(`Unsupported expiresIn unit: ${unit}`);
    }
  }

  private base64UrlEncode(value: string | Buffer): string {
    return Buffer.from(value)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private base64UrlDecode(value: string): string {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4;
    const padded = normalized + (padding ? '='.repeat(4 - padding) : '');
    return Buffer.from(padded, 'base64').toString('utf8');
  }

  private safeCompare(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);

    if (aBuffer.length !== bBuffer.length) {
      return false;
    }

    return timingSafeEqual(aBuffer, bBuffer);
  }
}
