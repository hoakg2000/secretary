import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { gmail_v1, google } from 'googleapis';
import { GoogleClientFactory } from '../auth/google-client.factory';
import { isGone } from '../common/google/google-errors';
import { runExclusive } from '../common/run-exclusive';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';

interface NewMessages {
  messageIds: string[];
  historyId: string | null;
}

/** Truy vấn Gmail của fallback listRecent: email 1 ngày gần nhất */
const RECENT_QUERY = 'newer_than:1d';

const decode =(data?: string | null) =>
  data ? Buffer.from(data, 'base64url').toString('utf8') : undefined;

function findPart(
  part: gmail_v1.Schema$MessagePart | undefined,
  mimeType: string,
): string | undefined {
  if (!part) return undefined;
  // File đính kèm có body.attachmentId thay vì body.data nên tự bị bỏ qua
  if (part.mimeType === mimeType && part.body?.data) {
    return decode(part.body.data);
  }
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return undefined;
}

/** Nội dung text/plain của email; nếu không có thì lấy text/html đã bỏ thẻ */
export function extractBody(payload?: gmail_v1.Schema$MessagePart) {
  return (
    findPart(payload, 'text/plain') ??
    findPart(payload, 'text/html')
      ?.replace(/<(style|script)[\s\S]*?<\/\1>|<[^>]+>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Nhận email qua Gmail Pub/Sub push (D3). Thông báo không chứa nội dung email:
 * mỗi thông báo kích hoạt một lượt đọc Gmail history kể từ history ID đã lưu.
 */
@Injectable()
export class GmailPushService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GmailPushService.name);
  private readonly verifier = new google.auth.OAuth2();
  private readonly lock = { running: false };

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly googleClientFactory: GoogleClientFactory,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly emailService: EmailService,
  ) {}

  // Watch của Gmail hết hạn sau 7 ngày: gia hạn mỗi ngày và một lần lúc khởi động
  onApplicationBootstrap() {
    const job = new CronJob(CronExpression.EVERY_DAY_AT_3AM, () => {
      void this.renewWatch();
    });
    this.schedulerRegistry.addCronJob('gmail-watch', job);
    job.start();
    void this.renewWatch();
  }

  /** Đăng ký / gia hạn Gmail watch. Bỏ qua khi chưa cấu hình topic hoặc chưa kết nối Google. */
  async renewWatch() {
    try {
      const topicName = this.configService.get<string>('GMAIL_PUBSUB_TOPIC');
      if (!topicName) return;

      const connected = await this.googleClientFactory.forConnectedUser();
      if (!connected) return;
      const { user, auth } = connected;
      const gmail = google.gmail({ version: 'v1', auth });

      const res = await gmail.users.watch({
        userId: 'me',
        requestBody: { topicName, labelIds: ['INBOX'] },
      });
      if (!user.gmailHistoryId && res.data.historyId) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { gmailHistoryId: res.data.historyId },
        });
      }
      this.logger.log('Đã gia hạn Gmail watch.');
    } catch (error) {
      this.logger.error('Gia hạn Gmail watch thất bại:', error);
    }
  }

  /**
   * Ranh giới tin cậy của route công khai POST /email/pubsub: chỉ chấp nhận ID token do Google ký
   * cho đúng audience và đúng service account của push subscription. Không bỏ qua, kể cả khi dev.
   */
  async verifyPushToken(authorization?: string) {
    const audience = this.configService.get<string>('PUBSUB_PUSH_AUDIENCE');
    const serviceAccount = this.configService.get<string>(
      'PUBSUB_PUSH_SERVICE_ACCOUNT',
    );
    if (
      !audience ||
      !serviceAccount ||
      !this.configService.get<string>('GMAIL_PUBSUB_TOPIC')
    ) {
      throw new ServiceUnavailableException('Gmail Pub/Sub chưa được cấu hình');
    }

    const idToken = authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!idToken) {
      throw new UnauthorizedException();
    }

    let payload: { email?: string; email_verified?: boolean } | undefined;
    try {
      const ticket = await this.verifier.verifyIdToken({ idToken, audience });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException();
    }
    if (payload?.email !== serviceAccount || !payload.email_verified) {
      throw new UnauthorizedException();
    }
  }

  /**
   * Một lượt nạp email mới. Trả về số email đã đọc từ Gmail.
   * Ném lỗi (không phải 2xx) khi lượt chưa hoàn tất để Pub/Sub gửi lại thông báo;
   * gửi lại an toàn vì EmailService.ingest bỏ qua email trùng Message-ID.
   */
  async runPass(): Promise<number> {
    return runExclusive(
      this.lock,
      async () => {
        const connected = await this.googleClientFactory.forConnectedUser();
        if (!connected) {
          // Ack: không có gì để thử lại cho tới khi kết nối Google (lượt đầu sau đó liệt kê lại 1 ngày gần nhất)
          this.logger.warn('Chưa kết nối tài khoản Google. Bỏ qua thông báo.');
          return 0;
        }

        const { user, auth } = connected;
        const gmail = google.gmail({ version: 'v1', auth });

        // Dùng history ID đã lưu, không dùng ID trong thông báo: thông báo có thể tới sai thứ tự
        const { messageIds, historyId } =
          (user.gmailHistoryId &&
            (await this.listHistory(gmail, user.gmailHistoryId))) ||
          (await this.listRecent(gmail));

        for (const id of messageIds) {
          await this.ingestMessage(gmail, id);
        }

        // Chỉ lưu sau khi cả lượt thành công
        if (historyId) {
          await this.prisma.user.update({
            where: { id: user.id },
            data: { gmailHistoryId: historyId },
          });
        }
        return messageIds.length;
      },
      () => {
        throw new ServiceUnavailableException('Lượt nạp Gmail trước chưa xong');
      },
    );
  }

  /** Email mới kể từ startHistoryId; null khi Google trả 404 (history ID quá cũ) */
  private async listHistory(
    gmail: gmail_v1.Gmail,
    startHistoryId: string,
  ): Promise<NewMessages | null> {
    const messageIds = new Set<string>();
    let historyId: string | null = startHistoryId;
    let pageToken: string | undefined;

    try {
      do {
        const res = await gmail.users.history.list({
          userId: 'me',
          startHistoryId,
          historyTypes: ['messageAdded'],
          labelId: 'INBOX',
          pageToken,
        });
        for (const record of res.data.history ?? []) {
          for (const added of record.messagesAdded ?? []) {
            if (added.message?.id) messageIds.add(added.message.id);
          }
        }
        historyId = res.data.historyId ?? historyId;
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
    } catch (error) {
      if (!isGone(error)) throw error;
      return null;
    }

    return { messageIds: [...messageIds], historyId };
  }

  /** Fallback khi chưa có / mất history ID: email trong hộp thư đến của 1 ngày gần nhất */
  private async listRecent(gmail: gmail_v1.Gmail): Promise<NewMessages> {
    // Lấy history ID trước khi liệt kê: email tới trong lúc liệt kê sẽ thuộc lượt sau, không bị sót
    const profile = await gmail.users.getProfile({ userId: 'me' });

    const messageIds: string[] = [];
    let pageToken: string | undefined;
    do {
      const res = await gmail.users.messages.list({
        userId: 'me',
        q: RECENT_QUERY,
        labelIds: ['INBOX'],
        pageToken,
      });
      for (const message of res.data.messages ?? []) {
        if (message.id) messageIds.push(message.id);
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    return { messageIds, historyId: profile.data.historyId ?? null };
  }

  private async ingestMessage(gmail: gmail_v1.Gmail, id: string) {
    let message: gmail_v1.Schema$Message;
    try {
      const res = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'full',
      });
      message = res.data;
    } catch (error) {
      // Email đã bị xóa trước khi kịp đọc
      if (isGone(error)) return;
      throw error;
    }

    const header = (name: string) =>
      message.payload?.headers?.find(
        (h) => h.name?.toLowerCase() === name.toLowerCase(),
      )?.value ?? undefined;

    await this.emailService.ingest({
      messageId: header('Message-ID') ?? id,
      sender: header('From') ?? 'unknown',
      subject: header('Subject'),
      rawBody: extractBody(message.payload),
    });
  }
}
