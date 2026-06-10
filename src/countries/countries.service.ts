import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { AppLogger } from '../common/logger/app-logger.service';
import { paginate, type Paginated } from '../common/types/pagination';
import { CurrenciesService } from '../currencies/currencies.service';
import { presentCountry, type CountryProfile } from './country-profile';
import {
  presentPublicCountry,
  type CountryPublicProfile,
} from './country-public-profile';
import { CountryQueryDto } from './dto/country-query.dto';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { Country } from './entities/country.entity';

@Injectable()
export class CountriesService {
  constructor(
    @InjectRepository(Country)
    private readonly countries: Repository<Country>,
    private readonly currencies: CurrenciesService,
    private readonly logger: AppLogger,
  ) {}

  async list(query: CountryQueryDto): Promise<Paginated<CountryProfile>> {
    const qb = this.countries.createQueryBuilder('c');
    if (query.activeOnly) {
      qb.andWhere('c.is_active = true');
    }
    if (query.search) {
      qb.andWhere('(c.code ILIKE :s OR c.name ILIKE :s)', {
        s: `%${query.search}%`,
      });
    }
    qb.orderBy('c.code', 'ASC').skip(query.skip).take(query.take);
    const [rows, total] = await qb.getManyAndCount();
    return paginate(rows.map(presentCountry), total, query);
  }

  async create(dto: CreateCountryDto): Promise<CountryProfile> {
    const existing = await this.countries.findOne({
      where: { code: dto.code },
    });
    if (existing) {
      throw new AppException(
        { code: 'COUNTRY_EXISTS', message: 'Country already exists' },
        409,
      );
    }
    // A country may only point at a real, active currency.
    await this.currencies.assertActive(dto.currencyCode);
    const saved = await this.countries.save(
      this.countries.create({
        code: dto.code,
        name: dto.name,
        dialCode: dto.dialCode,
        currencyCode: dto.currencyCode,
      }),
    );
    this.logger.log(
      { event: 'country.created', code: saved.code },
      'Countries',
    );
    return presentCountry(saved);
  }

  async update(code: string, dto: UpdateCountryDto): Promise<CountryProfile> {
    const country = await this.getOrFail(code);
    if (dto.currencyCode !== undefined) {
      await this.currencies.assertActive(dto.currencyCode);
      country.currencyCode = dto.currencyCode;
    }
    if (dto.name !== undefined) country.name = dto.name;
    if (dto.dialCode !== undefined) country.dialCode = dto.dialCode;
    if (dto.isActive !== undefined) country.isActive = dto.isActive;
    const saved = await this.countries.save(country);
    this.logger.log(
      { event: 'country.updated', code: saved.code, isActive: saved.isActive },
      'Countries',
    );
    return presentCountry(saved);
  }

  /** Load a country by code or throw 404. `code` is normalised to uppercase. */
  private async getOrFail(code: string): Promise<Country> {
    const country = await this.countries.findOne({
      where: { code: code.toUpperCase() },
    });
    if (!country) {
      throw new AppException(
        { code: 'COUNTRY_NOT_FOUND', message: 'Country not found' },
        404,
      );
    }
    return country;
  }

  /**
   * Load a country (active or not) for linking a money row to it (e.g. service
   * pricing). Throws 400 `COUNTRY_NOT_FOUND` — a *bad request body*, not a
   * missing addressable resource. `code` is normalised to uppercase.
   */
  async getForLink(code: string): Promise<Country> {
    const country = await this.countries.findOne({
      where: { code: code.toUpperCase() },
    });
    if (!country) {
      throw new AppException(
        { code: 'COUNTRY_NOT_FOUND', message: 'Country not found' },
        400,
      );
    }
    return country;
  }

  /** A country only if it exists AND is active; null otherwise (no throw). */
  findActive(code: string): Promise<Country | null> {
    return this.countries.findOne({
      where: { code: code.toUpperCase(), isActive: true },
    });
  }

  /** All active countries in the lean public shape (onboarding phone picker). */
  async listActivePublic(): Promise<CountryPublicProfile[]> {
    const rows = await this.countries.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
    return rows.map(presentPublicCountry);
  }

  /**
   * Assert a country exists and is active — used before *first* linking a money
   * row to it (mirrors `CurrenciesService.assertActive`). Returns the row.
   */
  async assertActive(code: string): Promise<Country> {
    const country = await this.getForLink(code);
    if (!country.isActive) {
      throw new AppException(
        { code: 'COUNTRY_INACTIVE', message: 'Country is not active' },
        400,
      );
    }
    return country;
  }
}
