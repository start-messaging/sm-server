import { Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  private readonly known = new Set<number>([1, 42]);

  create(_createUserDto: CreateUserDto) {
    return { id: 99, message: 'created' };
  }

  findAll() {
    return [{ id: 1 }, { id: 42 }];
  }

  findOne(id: number) {
    this.assertExists(id);
    return { id };
  }

  update(id: number, _updateUserDto: UpdateUserDto) {
    this.assertExists(id);
    return { id, updated: true };
  }

  remove(id: number) {
    this.assertExists(id);
    return { id, deleted: true };
  }

  private assertExists(id: number): void {
    if (!this.known.has(id)) {
      throw new AppException(
        { code: 'USER_NOT_FOUND', message: `User ${id} not found` },
        404,
      );
    }
  }
}
