import request from 'supertest';
import { DEFAULT_PASSWORD, uniqueEmail } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

interface RegisterData {
  verificationToken: string;
  devCode: string;
}

describe('POST /v1/referral/auth/verify-otp', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const register = async (email: string): Promise<RegisterData> => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/register')
      .send({ email, password: DEFAULT_PASSWORD, fullName: 'Partner' })
      .expect(201);
    return asSuccess<RegisterData>(res.body).data;
  };

  it('verifies the code and returns tokens + an active partner', async () => {
    const { verificationToken, devCode } = await register(
      uniqueEmail('verify-partner'),
    );

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/verify-otp')
      .send({ verificationToken, code: devCode })
      .expect(200);

    const body = asSuccess<{
      accessToken: string;
      refreshToken: string;
      partner: { status: string; emailVerified: boolean };
    }>(res.body);
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.partner.status).toBe('active');
    expect(body.data.partner.emailVerified).toBe(true);
  });

  it('rejects a wrong code with 400 OTP_INVALID', async () => {
    const { verificationToken, devCode } = await register(
      uniqueEmail('verify-partner-bad'),
    );
    const wrong = devCode === '000000' ? '111111' : '000000';

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/verify-otp')
      .send({ verificationToken, code: wrong })
      .expect(400);
    expect(asError(res.body).error.code).toBe('OTP_INVALID');
  });
});
