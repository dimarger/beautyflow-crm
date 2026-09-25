import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './auth.types';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly dummyHash = hash('constant-time-login-placeholder');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<{ accessToken: string; expiresIn: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    const passwordMatches = await verify(user?.isActive ? user.passwordHash : await this.dummyHash, dto.password);
    if (!user?.isActive || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const expiresInSeconds = this.config.get<number>('JWT_ACCESS_TTL_SECONDS', 900);
    const accessToken = await this.jwt.signAsync(
      { email: user.email, platformRole: user.platformRole },
      { subject: user.id },
    );
    return { accessToken, expiresIn: `${expiresInSeconds}s` };
  }

  me(user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
