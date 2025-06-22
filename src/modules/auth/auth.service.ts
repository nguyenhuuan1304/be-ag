import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from '../../dto/register.dto';
import { LoginDto } from '../../dto/login.dto';
import { randomBytes } from 'crypto';
import { Not, IsNull } from 'typeorm';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.userRepo.findOne({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('Email đã được sử dụng');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({
      email: dto.email,
      fullName: `${dto.firstName} ${dto.lastName}`,
      passwordHash,
      role: 'GDV_TTQT',
      refreshToken: null, // Khởi tạo refresh token
    });

    const savedUser = await this.userRepo.save(user);
    return {
      id: savedUser.id,
      email: savedUser.email,
      fullName: savedUser.fullName,
      role: savedUser.role,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user)
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch)
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');

    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = await this.jwtService.signAsync(payload, {
      expiresIn: '15m', // Access token hết hạn sau 15 phút
    });
    const refresh_token = randomBytes(32).toString('hex');

    // Lưu refresh token vào database
    user.refreshToken = await bcrypt.hash(refresh_token, 10);
    await this.userRepo.save(user);

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  async refreshToken(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Thiếu refresh token');

    // 1. Lấy toàn bộ user có refreshToken
    const users = await this.userRepo.find({
      where: { refreshToken: Not(IsNull()) },
    });

    // 2. Tìm user nào match với refreshToken gửi lên
    let foundUser: User | null = null;

    for (const user of users) {
      const isMatch = await bcrypt.compare(
        refreshToken,
        user.refreshToken || '',
      );
      if (isMatch) {
        foundUser = user;
        break;
      }
    }

    if (!foundUser)
      throw new UnauthorizedException('Refresh token không hợp lệ');

    // 3. Tạo token mới
    const payload = {
      sub: foundUser.id,
      email: foundUser.email,
      role: foundUser.role,
    };

    const access_token = await this.jwtService.signAsync(payload, {
      expiresIn: '15m',
    });

    const new_refresh_token = randomBytes(32).toString('hex');
    foundUser.refreshToken = await bcrypt.hash(new_refresh_token, 10);
    await this.userRepo.save(foundUser);

    return {
      access_token,
      refresh_token: new_refresh_token,
    };
  }

  async logout(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (user) {
      user.refreshToken = null;
      await this.userRepo.save(user);
    }
    return { message: 'Đăng xuất thành công' };
  }
}
