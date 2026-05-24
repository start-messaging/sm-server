import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 404, code: 'USER_NOT_FOUND' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 404, code: 'USER_NOT_FOUND' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 404, code: 'USER_NOT_FOUND' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(id);
  }
}
