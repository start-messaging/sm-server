import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { Repository } from 'typeorm';
import { User, UserStatus } from '../../src/users/entities/user.entity';
import {
  DEFAULT_PASSWORD,
  registerVerifiedUser,
  uniqueEmail,
} from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

describe('POST /v1/auth/login', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('logs in a verified user and returns tokens', async () => {
    const user = await registerVerifiedUser(ctx.app.getHttpServer());

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);

    const body = asSuccess<{ accessToken: string; refreshToken: string }>(
      res.body,
    );
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.refreshToken).toEqual(expect.any(String));
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    const user = await registerVerifiedUser(ctx.app.getHttpServer());

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: user.email, password: 'wrong-password' })
      .expect(401);
    expect(asError(res.body).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('unverified user: 403 USER_NOT_VERIFIED with recovery details that complete verification', async () => {
    const email = uniqueEmail('unverified');
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ email, password: DEFAULT_PASSWORD, fullName: 'Jane' })
      .expect(201);

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: DEFAULT_PASSWORD })
      .expect(403);
    const err = asError(res.body).error;
    expect(err.code).toBe('USER_NOT_VERIFIED');
    const details = err.details as {
      email: string;
      verificationToken: string;
      devCode: string;
    };
    expect(details.email).toBe(email);
    expect(details.verificationToken).toEqual(expect.any(String));
    expect(details.devCode).toMatch(/^\d{6}$/);

    // The recovery pair completes the registration → login now works.
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/verify-otp')
      .send({
        verificationToken: details.verificationToken,
        code: details.devCode,
      })
      .expect(200);
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: DEFAULT_PASSWORD })
      .expect(200);
  });

  it('unverified user + WRONG password: 401 with no recovery token leaked', async () => {
    const email = uniqueEmail('unverified-wrong');
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ email, password: DEFAULT_PASSWORD, fullName: 'Jane' })
      .expect(201);

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
    const err = asError(res.body).error;
    expect(err.code).toBe('INVALID_CREDENTIALS');
    expect(err.details).toBeUndefined();
  });

  it('suspended user: 403 ACCOUNT_SUSPENDED with no recovery details', async () => {
    const user = await registerVerifiedUser(ctx.app.getHttpServer());
    const users = ctx.app.get<Repository<User>>(getRepositoryToken(User));
    await users.update({ email: user.email }, { status: UserStatus.SUSPENDED });

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(403);
    const err = asError(res.body).error;
    expect(err.code).toBe('ACCOUNT_SUSPENDED');
    expect(err.details).toBeUndefined();
  });
});
