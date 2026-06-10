import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { ServiceStatus } from '../../src/services/entities/service.entity';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import { freshServiceKey, seedService } from '../helpers/reference';

interface ServiceProfile {
  key: string;
  name: string;
  status: string;
}

describe('PATCH /v1/admin/services/:key (update)', () => {
  let ctx: TestAppContext;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    const admin = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);
    token = await loginStaff(ctx.app.getHttpServer(), admin.email);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('updates name and status', async () => {
    const key = await seedService(ctx.app, {
      status: ServiceStatus.COMING_SOON,
    });
    const res = await request(ctx.app.getHttpServer())
      .patch(`/v1/admin/services/${key}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed', status: ServiceStatus.ACTIVE })
      .expect(200);
    const data = asSuccess<ServiceProfile>(res.body).data;
    expect(data.name).toBe('Renamed');
    expect(data.status).toBe(ServiceStatus.ACTIVE);
  });

  it('rejects an invalid status with 400', async () => {
    const key = await seedService(ctx.app);
    await request(ctx.app.getHttpServer())
      .patch(`/v1/admin/services/${key}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'banana' })
      .expect(400);
  });

  it('returns 404 SERVICE_NOT_FOUND for an unknown key', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch(`/v1/admin/services/${await freshServiceKey(ctx.app)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ghost' })
      .expect(404);
    expect(asError(res.body).error.code).toBe('SERVICE_NOT_FOUND');
  });

  it('forbids SUPPORT with 403', async () => {
    const key = await seedService(ctx.app);
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    await request(ctx.app.getHttpServer())
      .patch(`/v1/admin/services/${key}`)
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ name: 'Nope' })
      .expect(403);
  });
});
