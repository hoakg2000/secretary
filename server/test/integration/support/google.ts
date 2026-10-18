import { google } from 'googleapis';

/** Per-test handlers; set the ones a test needs. Unset handlers throw so a stray call is visible. */
export function createGoogleSpies() {
  const calendar = {
    events: { insert: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  };
  const gmail = {
    users: {
      watch: vi.fn(),
      getProfile: vi.fn(),
      history: { list: vi.fn() },
      messages: { list: vi.fn(), get: vi.fn() },
    },
  };
  /** OAuth2.getToken: resolves `{ tokens }` like google-auth-library */
  const getToken = vi.fn();
  /** OAuth2.verifyIdToken: resolves an object with getPayload() */
  const verifyIdToken = vi.fn();
  /** OAuth2.revokeToken: resolves when Google revoked the token */
  const revokeToken = vi.fn();

  const handlers = [
    calendar.events.insert,
    calendar.events.patch,
    calendar.events.delete,
    gmail.users.watch,
    gmail.users.getProfile,
    gmail.users.history.list,
    gmail.users.messages.list,
    gmail.users.messages.get,
    getToken,
    verifyIdToken,
    revokeToken,
  ];

  let installed: { mockRestore: () => void }[] = [];

  const spies = {
    calendar,
    gmail,
    getToken,
    verifyIdToken,
    revokeToken,
    /** a verified ID token payload, for verifyIdToken.mockResolvedValue */
    ticket: (payload: Record<string, unknown>) => ({ getPayload: () => payload }),
    install() {
      spies.restore();
      for (const fn of handlers) {
        fn.mockReset();
        fn.mockImplementation(() => {
          throw new Error('unscripted google call');
        });
      }
      installed = [
        vi.spyOn(google, 'calendar').mockImplementation((() => calendar) as any),
        vi.spyOn(google, 'gmail').mockImplementation((() => gmail) as any),
        vi.spyOn(google.auth.OAuth2.prototype, 'getToken').mockImplementation(getToken as any),
        vi.spyOn(google.auth.OAuth2.prototype, 'verifyIdToken').mockImplementation(verifyIdToken as any),
        vi.spyOn(google.auth.OAuth2.prototype, 'revokeToken').mockImplementation(revokeToken as any),
      ];
    },
    restore() {
      for (const spy of installed) spy.mockRestore();
      installed = [];
    },
    /** fresh spies with cleared handlers */
    reset() {
      spies.install();
    },
  };
  return spies;
}

export type GoogleSpies = ReturnType<typeof createGoogleSpies>;

/** An error shaped like a googleapis failure: carries the HTTP status */
export const googleError = (status: number) => Object.assign(new Error(`google ${status}`), { status });
