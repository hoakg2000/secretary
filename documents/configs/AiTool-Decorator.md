# Custom Decorator: `@AiTool()`

- **Vị trí file**: `src/shared/decorators/ai-tool.decorator.ts`
- **Mô tả chung**: Meta-data Decorator đánh dấu các method trong Service thành một **AI Function Tool**. Metadata này sẽ được `AiToolRegistryService` tự động thu thập (scan) khi ứng dụng khởi chạy để đăng ký vào danh sách Function Calling với Gemini AI Engine.

---

## Cấu trúc Metadata Interface

```typescript# Custom Decorator: `@AiTool()`

- **File Location**: `src/shared/decorators/ai-tool.decorator.ts`
- **General Description**: Meta-data Decorator that marks Service methods as an **AI Function Tool**. This metadata is automatically scanned and collected by `AiToolRegistryService` when the application starts to register them into the Function Calling list with the Gemini AI Engine.

---

## Metadata Interface Structure

```typescript
export interface AiToolParameterOption {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface AiToolOptions {
  /**
   * Unique Tool name used for AI Function Calling.
   * If left blank, the system automatically uses the method name.
   * Example: 'get_monthly_billing'
   */
  name?: string;

  /**
   * Detailed description of the Tool's task for the AI to decide when to call it.
   * Should be clear and context-rich.
   */
  description: string;

  /**
   * Defines input parameters that the AI needs to extract from User utterances.
   */
  parameters?: Record<string, AiToolParameterOption>;
}
export interface AiToolParameterOption {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface AiToolOptions {
  /**
   * Tên duy nhất của Tool dùng cho AI Function Calling.
   * Nếu bỏ trống, hệ thống tự động lấy theo tên method.
   * Ví dụ: 'get_monthly_billing'
   */
  name?: string;

  /**
   * Mô tả chi tiết nhiệm vụ của Tool để AI quyết định khi nào cần gọi.
   * Cần viết rõ ràng, giàu ngữ cảnh.
   */
  description: string;

  /**
   * Định nghĩa các tham số đầu vào mà AI cần trích xuất từ câu thoại của User.
   */
  parameters?: Record<string, AiToolParameterOption>;
}
```

---

## Hướng dẫn sử dụng trong Service

Gắn decorator `@AiTool()` trực tiếp lên trên method của Service mà bạn muốn cung cấp làm công cụ cho AI.

### Ví dụ 1: Method tra cứu báo cáo giao dịch/chi tiêu

```typescript
import { Injectable } from '@nestjs/common';
import { AiTool } from 'src/shared/decorators/ai-tool.decorator';

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  @AiTool({
    name: 'get_finance_summary',
    description:
      'Lấy báo cáo tổng quan biến động tài chính (thu, chi, số dư) theo chu kỳ thời gian.',
    parameters: {
      period: {
        type: 'string',
        description: 'Chu kỳ báo cáo cần lấy',
        required: true,
        enum: ['day', 'week', 'month', 'year'],
      },
      year: {
        type: 'number',
        description: 'Năm cần tra cứu (ví dụ: 2026)',
        required: false,
      },
      month: {
        type: 'number',
        description: 'Tháng cần tra cứu (từ 1 đến 12)',
        required: false,
      },
    },
  })
  async getFinanceSummary(query: {
    period: string;
    year?: number;
    month?: number;
  }) {
    // Logic truy vấn DB hoặc tính toán số dư...
    return this.prisma.transaction.findMany({
      /* ... */
    });
  }
}
```

### Ví dụ 2: Method tạo sự kiện Lịch Google Proxy

```typescript
@Injectable()
export class CalendarService {
  @AiTool({
    name: 'create_calendar_event',
    description:
      'Tạo một sự kiện hoặc lời nhắc mới vào Google Calendar của người dùng.',
    parameters: {
      title: {
        type: 'string',
        description: 'Tiêu đề hoặc nội dung sự kiện',
        required: true,
      },
      startTime: {
        type: 'string',
        description:
          'Thời gian bắt đầu theo định dạng ISO 8601 (ví dụ: 2026-10-05T14:00:00Z)',
        required: true,
      },
      endTime: {
        type: 'string',
        description: 'Thời gian kết thúc theo định dạng ISO 8601',
        required: false,
      },
    },
  })
  async createEvent(data: CreateEventDto) {
    // Logic đồng bộ sự kiện sang Google Calendar API...
  }
}
```

---

## Mã nguồn triển khai Decorator (`ai-tool.decorator.ts`)

```typescript
import { SetMetadata } from '@nestjs/common';

export const AI_TOOL_METADATA_KEY = 'AI_TOOL_METADATA_KEY';

export function AiTool(options: AiToolOptions): MethodDecorator {
  return (
    target: Object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const toolName = options.name || String(propertyKey);
    const metadata: AiToolOptions = {
      ...options,
      name: toolName,
    };

    SetMetadata(AI_TOOL_METADATA_KEY, metadata)(
      target,
      propertyKey,
      descriptor,
    );
  };
}
```
