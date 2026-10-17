/** Resolves with the rejection reason, fails the test when the promise resolves */
export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject, but it resolved');
}

/** Asserts the promise rejects with an instance of `type` (and, when given, a message containing `message`) */
export async function expectRejection(
  promise: Promise<unknown>,
  type: new (...args: any[]) => Error,
  message?: string,
) {
  const error = await rejection(promise);
  expect(error).toBeInstanceOf(type);
  if (message !== undefined) expect((error as Error).message).toContain(message);
}
