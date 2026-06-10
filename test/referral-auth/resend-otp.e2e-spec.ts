import request from 'supertest';
import { DEFAULT_PASSWORD, uniqueEmail } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

interface OtpIssueBody {
  verificationToken: string;
  devCode?: string;
}

describe('POST /v1/referral/auth/resend-otp', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function registerPartner(): Promise<OtpIssueBody> {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/register')
      .send({
        email: uniqueEmail('partner-resend'),
        password: DEFAULT_PASSWORD,
        fullName: 'Partner',
      })
      .expect(201);
    return asSuccess<OtpIssueBody>(res.body).data;
  }

  it('issues a fresh code; the new pair verifies', async () => {
    const issue = await registerPartner();

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/resend-otp')
      .send({ verificationToken: issue.verificationToken })
      .expect(200);
    const reissued = asSuccess<OtpIssueBody>(res.body).data;
    expect(reissued.verificationToken).not.toBe(issue.verificationToken);

    await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/verify-otp')
      .send({
        verificationToken: reissued.verificationToken,
        code: reissued.devCode,
      })
      .expect(200);
  });

  it('rejects resend after verification with 409 EMAIL_ALREADY_VERIFIED', async () => {
    const issue = await registerPartner();
    await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/verify-otp')
      .send({ verificationToken: issue.verificationToken, code: issue.devCode })
      .expect(200);

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/resend-otp')
      .send({ verificationToken: issue.verificationToken })
      .expect(409);
    expect(asError(res.body).error.code).toBe('EMAIL_ALREADY_VERIFIED');
  });

  it('rejects a CUSTOMER signup token with 400 OTP_INVALID (wrong subject)', async () => {
    const signup = await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: uniqueEmail('customer-x'),
        password: DEFAULT_PASSWORD,
        fullName: 'Customer',
      })
      .expect(201);
    const customerToken = asSuccess<OtpIssueBody>(signup.body).data
      .verificationToken;

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/resend-otp')
      .send({ verificationToken: customerToken })
      .expect(400);
    expect(asError(res.body).error.code).toBe('OTP_INVALID');
  });
});
