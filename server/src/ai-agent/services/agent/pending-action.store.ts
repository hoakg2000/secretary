import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export interface PendingAction {
  id: string;
  toolName: string;
  /** Tham số đã validate theo DTO của tool */
  args: object;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;

/**
 * Các lệnh ghi do AI đề xuất, chờ người dùng xác nhận.
 * shortcut: Map trong bộ nhớ (một process, một user) — mất khi restart; chuyển sang Redis nếu chạy nhiều instance.
 */
@Injectable()
export class PendingActionStore {
  private readonly actions = new Map<string, PendingAction>();

  add(toolName: string, args: object): PendingAction {
    const now = Date.now();
    for (const [id, action] of this.actions) {
      if (action.expiresAt <= now) this.actions.delete(id);
    }

    const action = {
      id: randomUUID(),
      toolName,
      args,
      expiresAt: now + TTL_MS,
    };
    this.actions.set(action.id, action);
    return action;
  }

  /** Lấy ra và xóa: mỗi action chỉ xác nhận/hủy được một lần. Hết hạn hoặc không tồn tại -> undefined */
  take(id: string): PendingAction | undefined {
    const action = this.actions.get(id);
    this.actions.delete(id);
    return action && action.expiresAt > Date.now() ? action : undefined;
  }
}
