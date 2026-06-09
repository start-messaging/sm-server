import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AppException } from '../common/exceptions/app.exception';
import { AppLogger } from '../common/logger/app-logger.service';
import { paginate, type Paginated } from '../common/types/pagination';
import { presentCurrency, type CurrencyProfile } from './currency-profile';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { Currency } from './entities/currency.entity';

@Injectable()
export class CurrenciesService {
  constructor(
    @InjectRepository(Currency)
    private readonly currencies: Repository<Currency>,
    private readonly logger: AppLogger,
  ) {}

  async list(query: PaginationQueryDto): Promise<Paginated<CurrencyProfile>> {
    const [rows, total] = await this.currencies.findAndCount({
      order: { code: 'ASC' },
      skip: query.skip,
      take: query.take,
    });
    return paginate(rows.map(presentCurrency), total, query);
  }

  async create(dto: CreateCurrencyDto): Promise<CurrencyProfile> {
    const existing = await this.currencies.findOne({
      where: { code: dto.code },
    });
    if (existing) {
      throw new AppException(
        { code: 'CURRENCY_EXISTS', message: 'Currency already exists' },
        409,
      );
    }
    const saved = await this.currencies.save(
      this.currencies.create({
        code: dto.code,
        name: dto.name,
        symbol: dto.symbol,
        decimalPlaces: dto.decimalPlaces ?? 2,
      }),
    );
    this.logger.log(
      { event: 'currency.created', code: saved.code },
      'Currencies',
    );
    return presentCurrency(saved);
  }

  async update(code: string, dto: UpdateCurrencyDto): Promise<CurrencyProfile> {
    const currency = await this.getOrFail(code);
    if (dto.name !== undefined) currency.name = dto.name;
    if (dto.symbol !== undefined) currency.symbol = dto.symbol;
    if (dto.decimalPlaces !== undefined)
      currency.decimalPlaces = dto.decimalPlaces;
    if (dto.isActive !== undefined) currency.isActive = dto.isActive;
    const saved = await this.currencies.save(currency);
    this.logger.log(
      { event: 'currency.updated', code: saved.code, isActive: saved.isActive },
      'Currencies',
    );
    return presentCurrency(saved);
  }

  /** Load a currency by code or throw 404. `code` is normalised to uppercase. */
  private async getOrFail(code: string): Promise<Currency> {
    const currency = await this.currencies.findOne({
      where: { code: code.toUpperCase() },
    });
    if (!currency) {
      throw new AppException(
        { code: 'CURRENCY_NOT_FOUND', message: 'Currency not found' },
        404,
      );
    }
    return currency;
  }

  /**
   * Assert a currency exists and is active — used by `countries` (and later
   * pricing) before linking money rows to it. Returns the row for convenience.
   */
  async assertActive(code: string): Promise<Currency> {
    const currency = await this.currencies.findOne({
      where: { code: code.toUpperCase() },
    });
    if (!currency) {
      throw new AppException(
        { code: 'CURRENCY_NOT_FOUND', message: 'Currency not found' },
        400,
      );
    }
    if (!currency.isActive) {
      throw new AppException(
        { code: 'CURRENCY_INACTIVE', message: 'Currency is not active' },
        400,
      );
    }
    return currency;
  }
}
