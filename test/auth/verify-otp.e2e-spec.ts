import request from 'supertest';
import { DEFAULT_PASSWORD, uniqueEmail } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

interface SignupData {
  verificationToken: string;
  devCode: string;
}

describe('POST /v1/auth/verify-otp', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const signup = async (email: string): Promise<SignupData> => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ email, password: DEFAULT_PASSWORD, fullName: 'Jane' })
      .expect(201);
    return asSuccess<SignupData>(res.body).data;
  };

  it('verifies the code and returns tokens + an active user', async () => {
    const { verificationToken, devCode } = await signup(uniqueEmail('verify'));

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/verify-otp')
      .send({ verificationToken, code: devCode })
      .expect(200);

    const body = asSuccess<{
      accessToken: string;
      refreshToken: string;
      user: { status: string; emailVerified: boolean };
    }>(res.body);
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.refreshToken).toEqual(expect.any(String));
    expect(body.data.user.status).toBe('active');
    expect(body.data.user.emailVerified).toBe(true);
  });

  it('rejects a wrong code with 400 OTP_INVALID', async () => {
    const { verificationToken, devCode } = await signup(
      uniqueEmail('verifybad'),
    );
    const wrong = devCode === '000000' ? '111111' : '000000';

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/verify-otp')
      .send({ verificationToken, code: wrong })
      .expect(400);
    expect(asError(res.body).error.code).toBe('OTP_INVALID');
  });
});
