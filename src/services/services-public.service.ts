import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service, ServiceStatus } from './entities/service.entity';
import {
  presentPublicService,
  type PublicServiceProfile,
} from './service-public-profile';

/**
 * Customer-facing reads over the service catalogue. "Available in a country" =
 * the service is sellable (active|beta, never coming_soon) AND has at least one
 * active rate row for that country — a priced country is an available country.
 */
@Injectable()
export class ServicesPublicService {
  constructor(
    @InjectRepository(Service)
    private readonly services: Repository<Service>,
  ) {}

  async listAvailableForCountry(
    countryCode: string,
  ): Promise<PublicServiceProfile[]> {
    const rows = await this.services
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.categories', 'c')
      .where('s.status IN (:...statuses)', {
        statuses: [ServiceStatus.ACTIVE, ServiceStatus.BETA],
      })
      .andWhere(
        `EXISTS (SELECT 1 FROM service_country_rates r
                 WHERE r.service_key = s.key
                   AND r.country_code = :cc
                   AND r.is_active = true)`,
        { cc: countryCode },
      )
      .orderBy('s.key', 'ASC')
      .getMany();
    return rows.map(presentPublicService);
  }
}
