/** Đọc luồng SSE, trả từng payload của dòng `data:`; dừng ngay khi gặp `[DONE]` */
export async function* sseData(
  body: AsyncIterable<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';

  // Payload của một dòng; null nếu không phải dòng data hoặc rỗng
  const payload = (line: string) =>
    line.startsWith('data:') ? line.slice(5).trim() || null : null;

  for await (const part of body) {
    buffer += decoder.decode(part, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const data = payload(line.trim());
      if (data === '[DONE]') return;
      if (data) yield data;
    }
  }
  // Dòng cuối không có '\n'
  const last = payload(buffer.trim());
  if (last && last !== '[DONE]') yield last;
}
