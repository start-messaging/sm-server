import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  create(dto: CreateUserDto): Promise<User> {
    const user = this.users.create(dto);
    return this.users.save(user);
  }

  findAll(): Promise<User[]> {
    return this.users.find();
  }

  async findOne(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) {
      throw new AppException(
        { code: 'USER_NOT_FOUND', message: `User ${id} not found` },
        404,
      );
    }
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    Object.assign(user, dto);
    return this.users.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.users.softRemove(user);
  }
}
