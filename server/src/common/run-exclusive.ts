export interface ExclusiveLock {
  running: boolean;
}

/**
 * Chỉ chạy fn khi chưa có lượt nào giữ lock; ngược lại trả/ném kết quả của onBusy.
 * shortcut: cờ trong bộ nhớ chỉ đúng khi có một instance server, nhiều instance thì đổi sang khóa Redis hoặc advisory lock.
 */
export async function runExclusive<T>(
  lock: ExclusiveLock,
  fn: () => Promise<T>,
  onBusy: () => T,
): Promise<T> {
  if (lock.running) return onBusy();
  lock.running = true;
  try {
    return await fn();
  } finally {
    lock.running = false;
  }
}
