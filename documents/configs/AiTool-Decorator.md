# Custom Decorator: `@AiTool()`

- **File location**: `server/src/common/decorators/ai-tool.decorator.ts`
- **Description**: metadata decorator that marks a service method as an **AI function tool**. At start-up
  `AgentService.onModuleInit` (`server/src/ai-agent/services/agent/agent.service.ts`) scans every provider with
  `DiscoveryService`, collects the decorated methods, and declares them to the model (`LlmService`) for function calling. There is no
  `AiToolRegistryService`.

---

## Metadata interface

```typescript
export interface AiToolParameterOption {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface AiToolOptions {
  /** Unique tool name. Blank → the method name. */
  name?: string;
  /** What the tool does, for the model to decide when to call it. */
  description: string;
  /** Input parameters the model extracts from the conversation. */
  parameters?: Record<string, AiToolParameterOption>;
  /** The model's arguments are converted to this class and validated (class-validator) before the tool runs. */
  dto?: Type<object>;
  /** Write tool: not run inside the chat loop, parked until the user confirms. */
  requiresConfirmation?: boolean;
}
```

## Contract

- A tool method takes exactly **one** argument object (the arguments the model sent).
- With `dto`, the arguments are validated with `whitelist` and `forbidNonWhitelisted`; invalid arguments are
  reported back to the model as an error, not thrown.
- With `requiresConfirmation: true`, `AgentService` emits a `confirmation_required` frame and stores the call in
  `PendingActionStore` (5 minutes). It runs once, on `POST /api/v1/ai-agent/actions/:actionId/confirm`.
- The tool is declared to the model only if its class is a registered Nest provider.

## Usage

Put `@AiTool()` on the service method.

### Example 1: a read tool without parameters

From `server/src/finance/finance.service.ts`:

```typescript
@AiTool({
  name: 'get_financial_summary',
  description:
    '...',  // shortened: returns the balance of every bank account and the total balance
})
async aiGetFinancialSummary() {
  // totals per currency + active accounts
}
```

### Example 2: a write tool that needs confirmation

From `server/src/finance/finance.service.ts` (parameters shortened):

```typescript
@AiTool({
  name: 'create_financial_transaction',
  description: '...',  // shortened
  dto: AiCreateTransactionDto,
  requiresConfirmation: true,
  parameters: {
    accountId: { type: 'string', description: '...', required: true },
    amount: { type: 'number', description: '...', required: true },
    type: { type: 'string', description: '...', enum: ['INCOME', 'EXPENSE'], required: true },
  },
})
async aiCreateTransaction(dto: AiCreateTransactionDto) {
  // ...
}
```

## Implementation

```typescript
import { SetMetadata } from '@nestjs/common';

export const AI_TOOL_METADATA_KEY = 'AI_TOOL_METADATA_KEY';

export function AiTool(options: AiToolOptions): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    const metadata = { ...options, name: options.name || String(propertyKey) };
    SetMetadata(AI_TOOL_METADATA_KEY, metadata)(target, propertyKey, descriptor);
  };
}
```

## Tools in the code

The list of tools and their confirmation flags is in `modules/ai/ai.service.md`.
