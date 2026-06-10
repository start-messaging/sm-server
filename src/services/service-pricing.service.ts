import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { AppLogger } from '../common/logger/app-logger.service';
import { CountriesService } from '../countries/countries.service';
import { AddCountryDto } from './dto/add-country.dto';
import { UpsertRateDto } from './dto/upsert-rate.dto';
import { ServiceCountryRate } from './entities/service-country-rate.entity';
import { ServiceCategory } from './entities/service-category.entity';
import { Service } from './entities/service.entity';
import {
  buildServiceRatesView,
  presentRate,
  type RateProfile,
  type ServiceRatesView,
} from './rate-profile';

/**
 * Country-tier pricing for a service: cost/sell per (service, country,
 * category). Lives in the services module — a rate is owned by a service and
 * shares its auth/lifecycle.
 */
@Injectable()
export class ServicePricingService {
  constructor(
    @InjectRepository(ServiceCountryRate)
    private readonly rates: Repository<ServiceCountryRate>,
    @InjectRepository(Service)
    private readonly services: Repository<Service>,
    private readonly countries: CountriesService,
    private readonly logger: AppLogger,
  ) {}

  /** Grouped per-country / per-category view for a service. */
  async getRates(key: string): Promise<ServiceRatesView> {
    const service = await this.getServiceOrFail(key);
    const rows = await this.rates.find({
      where: { serviceKey: key },
      relations: { country: true, currencyRef: true },
    });
    return buildServiceRatesView(service, rows);
  }

  /** Create or replace one (country, category) rate cell. Idempotent. */
  async upsertRate(
    key: string,
    countryCode: string,
    categoryKey: string,
    dto: UpsertRateDto,
  ): Promise<RateProfile> {
    const service = await this.getServiceOrFail(key);
    this.assertCategory(service, categoryKey);
    const cc = countryCode.toUpperCase();
    const country = await this.countries.getForLink(cc);
    if (dto.currency !== country.currencyCode) {
      throw new AppException(
        {
          code: 'RATE_CURRENCY_MISMATCH',
          message: `Rate currency must be ${country.currencyCode} for ${cc}`,
        },
        422,
      );
    }

    let rate = await this.rates.findOne({
      where: { serviceKey: key, countryCode: cc, categoryKey },
    });
    if (!rate) {
      rate = this.rates.create({
        serviceKey: key,
        countryCode: cc,
        categoryKey,
        currency: country.currencyCode,
        providerCostMicros: null,
        sellMicros: null,
        isActive: true,
      });
    }
    rate.currency = country.currencyCode;
    if (dto.providerCostMicros !== undefined)
      rate.providerCostMicros = dto.providerCostMicros;
    if (dto.sellMicros !== undefined) rate.sellMicros = dto.sellMicros;
    if (dto.isActive !== undefined) rate.isActive = dto.isActive;

    const saved = await this.rates.save(rate);
    this.logger.log(
      {
        event: 'service.rate.upserted',
        service: key,
        country: cc,
        category: categoryKey,
      },
      'Services',
    );
    return presentRate(saved);
  }

  /** Seed one unpriced rate row per category for a country. */
  async addCountry(key: string, dto: AddCountryDto): Promise<ServiceRatesView> {
    const service = await this.getServiceOrFail(key);
    if (service.categories.length === 0) {
      throw new AppException(
        {
          code: 'SERVICE_HAS_NO_CATEGORIES',
          message: 'Add a category before pricing a country',
        },
        422,
      );
    }
    const cc = dto.countryCode.toUpperCase();
    const country = await this.countries.assertActive(cc);

    const already = await this.rates.exists({
      where: { serviceKey: key, countryCode: cc },
    });
    if (already) {
      throw new AppException(
        { code: 'RATE_COUNTRY_EXISTS', message: 'Country already priced' },
        409,
      );
    }

    await this.rates.save(
      service.categories.map((c) =>
        this.rates.create({
          serviceKey: key,
          countryCode: cc,
          categoryKey: c.key,
          currency: country.currencyCode,
          providerCostMicros: null,
          sellMicros: null,
          isActive: true,
        }),
      ),
    );
    this.logger.log(
      { event: 'service.rate.country.added', service: key, country: cc },
      'Services',
    );
    return this.getRates(key);
  }

  /** Delete one (country, category) rate cell. */
  async removeRate(
    key: string,
    countryCode: string,
    categoryKey: string,
  ): Promise<void> {
    const cc = countryCode.toUpperCase();
    const rate = await this.rates.findOne({
      where: { serviceKey: key, countryCode: cc, categoryKey },
    });
    if (!rate) {
      throw new AppException(
        { code: 'RATE_NOT_FOUND', message: 'Rate not found' },
        404,
      );
    }
    await this.rates.remove(rate);
    this.logger.log(
      {
        event: 'service.rate.removed',
        service: key,
        country: cc,
        category: categoryKey,
      },
      'Services',
    );
  }

  /** Remove a whole country (all its category rates) from a service. */
  async removeCountry(key: string, countryCode: string): Promise<void> {
    const cc = countryCode.toUpperCase();
    const count = await this.rates.count({
      where: { serviceKey: key, countryCode: cc },
    });
    if (count === 0) {
      throw new AppException(
        { code: 'RATE_COUNTRY_NOT_FOUND', message: 'Country not priced' },
        404,
      );
    }
    await this.rates.delete({ serviceKey: key, countryCode: cc });
    this.logger.log(
      { event: 'service.rate.country.removed', service: key, country: cc },
      'Services',
    );
  }

  /* ------------------------------ helpers ------------------------------- */

  private async getServiceOrFail(key: string): Promise<Service> {
    const service = await this.services.findOne({
      where: { key },
      relations: { categories: true },
    });
    if (!service) {
      throw new AppException(
        { code: 'SERVICE_NOT_FOUND', message: 'Service not found' },
        404,
      );
    }
    return service;
  }

  private assertCategory(service: Service, categoryKey: string): void {
    const exists = (service.categories ?? []).some(
      (c: ServiceCategory) => c.key === categoryKey,
    );
    if (!exists) {
      throw new AppException(
        {
          code: 'SERVICE_CATEGORY_NOT_FOUND',
          message: 'Category does not belong to this service',
        },
        400,
      );
    }
  }
}
