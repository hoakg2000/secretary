const SIMPLE_ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
};

/**
 * Model stream JSON { message_vi, message_jp } theo từng mảnh; parser này lấy dần phần chữ đã giải mã của message_vi
 * để gửi cho client ngay, không phải chờ JSON hoàn chỉnh.
 */
export class ReplyStreamParser {
  private inString = false;
  private isKey = false;
  private afterColon = false;
  private key = '';
  private escape: string | null = null;
  private heldHighSurrogate = '';

  /** Nhận một mảnh JSON, trả về các ký tự mới của message_vi (chuỗi rỗng nếu chưa có) */
  feed(chunk: string): string {
    let out = this.heldHighSurrogate;
    this.heldHighSurrogate = '';

    for (const ch of chunk) {
      if (!this.inString) {
        if (ch === '"') {
          this.inString = true;
          this.isKey = !this.afterColon;
          if (this.isKey) this.key = '';
        } else if (ch === ':') {
          this.afterColon = true;
        } else if (ch === ',') {
          this.afterColon = false;
        }
        continue;
      }

      let decoded = ch;
      if (this.escape !== null) {
        this.escape += ch;
        if (this.escape[0] === 'u') {
          if (this.escape.length < 5) continue;
          decoded = String.fromCharCode(parseInt(this.escape.slice(1), 16));
        } else {
          decoded = SIMPLE_ESCAPES[ch] ?? ch; // `"`, `\`, `/` giữ nguyên
        }
        this.escape = null;
      } else if (ch === '\\') {
        this.escape = '';
        continue;
      } else if (ch === '"') {
        this.inString = false;
        continue;
      }

      if (this.isKey) this.key += decoded;
      else if (this.key === 'message_vi') out += decoded;
    }

    // Surrogate cao nằm cuối mảnh: giữ lại để ghép với surrogate thấp ở mảnh sau
    const last = out.charCodeAt(out.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) {
      this.heldHighSurrogate = out.slice(-1);
      out = out.slice(0, -1);
    }
    return out;
  }
}
