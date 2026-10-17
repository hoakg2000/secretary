import { describe, expect, it } from 'vitest';
import { ingest, uniqueMessageId, waitForEmailDone } from './support/email';
import { bootFlow, need } from './support/flow';
import { api, chat } from './support/http';

describe('asking about emails in chat (real Gemini)', () => {
  const ctx = bootFlow();
  const state: { mariId?: string } = {};

  it('ingests two emails and waits for the worker to process both', async () => {
    const characters = await api('GET', '/characters', { token: ctx.token });
    state.mariId = characters.body.data.find((c: { slug?: string }) => c.slug === 'iochi_mari')?.id;
    expect(state.mariId, 'seeded character iochi_mari').toBeDefined();

    const emails = [
      {
        messageId: uniqueMessageId('chat-hr'),
        sender: 'Công ty Hoa Sen <hr@hoasen-e2e.test>',
        subject: 'Thư mời phỏng vấn vị trí kỹ sư phần mềm',
        rawBody: 'Chúng tôi trân trọng mời bạn phỏng vấn vị trí kỹ sư phần mềm vào thứ Sáu tuần này. Vui lòng xác nhận tham dự.',
      },
      {
        messageId: uniqueMessageId('chat-shop'),
        sender: 'Shopee <noreply@shopee-e2e.test>',
        subject: 'Đơn hàng tai nghe Bluetooth đã giao thành công',
        rawBody: 'Đơn hàng tai nghe Bluetooth của bạn đã được giao thành công. Cảm ơn bạn đã mua sắm.',
      },
    ];
    for (const email of emails) {
      const { status, body } = await ingest(ctx.token, email);
      expect(status).toBe(200);
      const row = await waitForEmailDone(ctx.token, need(body.data?.emailLogId, 'email log id'));
      expect(row.status).toBe('PROCESSED');
    }
  });

  it('calls search_emails and mentions the received emails', async () => {
    const result = await chat(ctx.token, {
      message: 'Hôm nay tôi nhận được những email nào? Hãy tra cứu hộp thư và liệt kê người gửi cùng chủ đề.',
      characterId: need(state.mariId, 'Mari character id'),
    });

    expect(result.status).toBe(200);
    expect(result.errors).toEqual([]);
    const call = result.ofType('tool_call').find((f) => f.tool === 'search_emails');
    expect(call, 'tool_call frame for search_emails').toBeDefined();

    const toolResult = result.ofType('tool_result').find((f) => f.tool === 'search_emails');
    expect(toolResult, 'tool_result frame for search_emails').toBeDefined();
    const rows = toolResult?.result;
    expect(Array.isArray(rows)).toBe(true);
    // the raw email body is untrusted content and never goes back to the model
    for (const row of rows as Record<string, unknown>[]) expect(row).not.toHaveProperty('rawBody');

    const reply = result.text.normalize('NFC').toLowerCase();
    const mentioned = ['hoa sen', 'phỏng vấn', 'shopee', 'đơn hàng', 'tai nghe'].some((word) => reply.includes(word));
    expect(mentioned, `reply mentions a sender or subject keyword: ${reply.slice(0, 200)}`).toBe(true);
    expect(result.frames.at(-1)?.type).toBe('done');
  });
});
