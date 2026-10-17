# MộtAPI (motapis.com) evaluation — 2026-10-18

Can MộtAPI replace Gemini as the LLM behind the server? Measured with real calls on the owner's free key
(`MOT_API_KEY`), synthetic prompts only.

## Verdict

**Yes for chat and email classification; no for embeddings.**

- **Chat:** 4 free models do everything the chat agent needs:
  - persona JSON `{message_vi, message_jp}` in Japanese script;
  - OpenAI function calling, including the round trip with the tool result;
  - `response_format: json_schema` together with tools;
  - SSE streaming, including streamed tool calls.
- **Email classification:** all 4 classified a bank alert correctly (TRANSACTION, 500,000).
- **Memory embeddings:** MộtAPI has no embeddings endpoint and no embedding model. Memory search must stay on Gemini
  `gemini-embedding-001`.
- **Recommended:** `gpt-6-astra` for chat, the fastest with full support. `claude-sonnet-5-5` as the fallback, with
  the best persona and Vietnamese quality. Either works for email classification.
- **Budget:** 2M tokens a day is about 250 chat turns a day. 20M a month is about 2,500 turns a month, or about 80 a
  day sustained (see "Token budget"). That is enough for one user, unlike the Gemini free tier, which stopped after
  20 requests.

## Service facts (docs and privacy page, read 2026-10-18)

- **APIs:**
  - OpenAI-compatible: `POST https://motapis.com/v1/chat/completions`, with `Authorization: Bearer`.
  - Anthropic-compatible: `POST https://motapis.com/v1/messages`, with `x-api-key`.
  - `GET /v1/models`.
- **Streaming:** SSE with `stream: true`, ending with `data: [DONE]`.
- **Undocumented but verified here:** `tools` / `tool_calls`, `response_format` (`json_schema` and `json_object`), and
  `stream_options.include_usage`.
- **Free tier:**
  - Personal emails only.
  - "No uptime commitment or support."
  - Free models "may be removed at any time, even while you are running."
  - Limits can change without notice.
  - No rate-limit numbers are published, only 429 with backoff. The 2M/day and 20M/month figures come from the owner,
    not from the docs.
- **Privacy (`/privacy`, updated 2026-10-07):**
  - Prompt and reply text "is not recorded". Request metadata is kept: model, tokens, IP, duration.
  - The full request and reply go to the upstream model provider, under that provider's own policy.
  - Servers are outside Vietnam. Training use is not mentioned.
- **Ignored on purpose:** the docs page contains prompts aimed at AI agents and a CLI setup script
  (`/motapis_cli_setup.py`). Nothing from them was run.

## Method

The probe script `C:\Users\hoakg\.claude\jobs\07e72801\tmp\motapi-probe.mjs` sits outside the repo. It reads the key
from `server/.env` with dotenv and never prints it. Raw results are in `motapi-results.json` next to it.

- **Totals:** 41 calls, about 33.4k tokens, which is 1.7% of a day. There is a 100k-token cap and a stop on
  401/402/429.
- **Stages:**
  - **A:** list the models.
  - **B:** one persona reply per free model, with JSON requested in the prompt only.
  - **C:** on the top 5:
    - a tool call (`create_financial_transaction`), then the reply after the tool result;
    - `response_format: json_schema` together with `tools`;
    - streaming;
    - email classification with `json_object`.
  - **S:** a streaming turn that should trigger `search_emails`.

## Stage B: all 17 free models (persona reply, prompt-only JSON)

| Model | HTTP | Latency | Tokens | JSON ok | JP script | Note |
|---|---|---|---|---|---|---|
| claude-sonnet-5-5 | 200 | 5.2 s | 199 | yes | yes | clean JSON, natural persona |
| gpt-6-astra | 200 | 2.8 s | 224 | yes | yes | clean, uses 先生 |
| gpt-6-luna | 200 | 3.2 s | 157 | yes | yes | clean, terse |
| claude-sonnet-4-6 | 200 | 6.0 s | 458 | yes (in a code fence) | yes | |
| claude-sonnet-5 | 200 | 5.1 s | 344 | yes (in a code fence) | yes | timed out in stage C |
| glm-5.3-flash | 200 | 4.7 s | 504 | yes (in a code fence) | yes | richest persona text |
| gpt-5.6-sol | 200 | 4.6 s | 4,554 | yes | yes | about 4k hidden reasoning tokens per call; writes "Sensei" in Latin letters in JP |
| gpt-6-sol | 200 | 3.5 s | 4,548 | yes | yes | same reasoning cost |
| grok-4.5 | 200 | 31.1 s | 2,036 | yes | yes | too slow |
| DeepSeek-V4-Flash-0731 | 200 | 4.8 s | 605 | no | no | empty content |
| deepseek-v4-flash | 200 | 5.2 s | 751 | no | no | ignored the persona and format |
| hy3 | 200 | 6.4 s | 520 | no | no | returned its reasoning as content |
| minimax-m2.7 | 200 | 10.8 s | 431 | no | no | `<think>` text in content |
| minimax-m3 | 200 | 25.0 s | 773 | no | no | empty content |
| grok-4.6 | 503 | — | — | — | — | upstream_error |
| qwen3.8-max | 502 | — | — | — | — | HTML error page |
| hy4-preview | timeout | >120 s | — | — | — | |

## Stage C and S: top candidates (what the app actually needs)

| Model | Tool call (args correct) | Reply after tool result | `json_schema` + tools | Stream, time to first token | Streamed tool call (S) | Email classify |
|---|---|---|---|---|---|---|
| gpt-6-astra | yes, 2.2 s | JSON, JP script | accepted, valid | 1.9 s | `search_emails`, 2.1 s, `finish_reason: tool_calls` | TRANSACTION 500,000 |
| claude-sonnet-5-5 | yes, 2.9 s | JSON, JP script | accepted, valid | 5.5 s | `search_emails`, 2.9 s, `finish_reason: tool_calls` | TRANSACTION 500,000 |
| gpt-6-luna | yes, 14.1 s | JSON, JP script | accepted, valid | 1.9 s | not tested | TRANSACTION 500,000 |
| glm-5.3-flash | yes, 7.7 s | JSON, JP script | accepted, valid | 6.2 s | not tested | TRANSACTION 500,000 |
| claude-sonnet-5 | timeout | — | valid (in a code fence) | timeout | not tested | 502 |

The tool arguments were `{"amount":50000,"description":"Ăn trưa","type":"EXPENSE"}` for every passing model.

## Token budget

These figures come from the app's prompt sizes. The probe prompts were smaller, so these are estimates.

- **System instruction:** about 2.5k tokens for the default prompt plus Mari (8.1k characters), about 1–1.5k for the
  13 tool declarations, about 1–2k of history, and about 300 for the reply. That is roughly 5–6k tokens per model
  call.
- **Turns:** a turn with one tool call makes 2 calls, so the average is about 8k tokens per chat turn.
  - At 2M a day, that is about 250 turns a day.
  - At 20M a month, that is about 2,500 turns a month, or about 80 a day sustained. The monthly cap binds first.
- **Email classification:** about 600 tokens per email, so 100 emails a day is about 60k tokens, 3% of a day.
- **Avoid:** `gpt-5.6-sol` and `gpt-6-sol` use about 4.5k tokens even for a greeting, because of hidden reasoning.
  They would cut capacity by about 2–3×.

## Gaps and risks

- **No embeddings.** `MemoryService` keeps calling Gemini `gemini-embedding-001`. Its quota is separate and was
  never the problem. So the app would need two providers.
- **Free tier stability.** In this run 3 of 17 models were broken (502, 503, timeout) and 1 timed out mid-test. The
  docs warn that models can disappear while running.
  - Keep the model name in config.
  - Keep a fallback model ready.
  - The e2e preflight would catch an outage.
- **Data path.** Chat history, memories, finance details and email summaries would go to MộtAPI and then to
  OpenAI/Anthropic, outside Vietnam. The text is not stored by MộtAPI according to its policy.
- **Not whitelisted.** The service has no SLA or support, so the key should get a spending limit in the dashboard.
- **Code fences.** Some models wrap JSON in code fences. The streaming parser would need to skip a leading fence, or
  `response_format: json_schema` should be used, which all 4 candidates accepted.

## Integration sketch (not implemented)

Today the server uses `@google/genai` everywhere:

| Area | File | What changes |
|---|---|---|
| Client | `server/src/ai-agent/genai.provider.ts` | Add an OpenAI-compatible client, either plain `fetch` with SSE or the `openai` SDK with `baseURL`. Read `MOT_API_KEY` and the model name from config. |
| Chat loop | `server/src/ai-agent/services/agent/agent.service.ts` (`runChat`, `executeToolCall`) | Replace `chats.create` / `sendMessageStream` / `functionResponse` with `messages[]`, `tools`, `tool_calls` deltas and `role: tool` results. Map the tool declarations from `Type.OBJECT` (Gemini) to lowercase JSON Schema. `ReplyStreamParser` and the `reply` frame stay. |
| Email | `server/src/email/email-ai.service.ts` | `response_format: json_schema` with the existing `RESPONSE_SCHEMA`. |
| Embeddings | `server/src/ai-agent/services/memory/memory.service.ts` | No change, stays on Gemini. |
| Tests | `server/test/integration/support/genai.ts`, `test/e2e/global-setup.ts` | Add an OpenAI-shaped fake at the client boundary, and a preflight against MộtAPI. |

Rough size: one provider interface, about 3 call sites, and the test fakes. That needs its own plan before any code
changes.
