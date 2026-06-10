// Side-effect module for the otp-cooldown spec ONLY. ConfigModule.forRoot()
// snapshots process.env when AppModule is IMPORTED (module evaluation), not
// when the app boots — so this must be imported BEFORE create-test-app pulls
// in AppModule. A beforeAll() assignment is too late.
//
// The spec's afterAll restores '0' (jest reuses one process under
// maxWorkers: 1, so the mutation would otherwise leak into later files).
process.env.OTP_RESEND_COOLDOWN_SEC = '300';

export const TEST_OTP_COOLDOWN_SEC = 300;
