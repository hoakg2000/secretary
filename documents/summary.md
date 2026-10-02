# AI Personal Assistant — Project Overview

> Source tags:
>
> - **[S1]** `documents/summary.md`
> - **[S2]** `documents/server/summary.md`
> - **[S3]** `project background`
>
> Items marked "Not specified" mean the provided documents do not state the information.

---

## 1. Project Overview

A multi-platform smart personal assistant system deeply integrated with the Google ecosystem (Gmail, Google Calendar). It automatically processes emails, manages schedules, and tracks expenses via email balance updates. Its key feature is **Self-Updating Semantic Memory**, which personalizes the experience across multi-session conversations for a single user. [S1 §1.1] [S3 §1]

**Main features** [S3 §2]:

- High priority: Self-Updating Semantic Memory, Email Summarization & Classification, Calendar Management, Automatic Expense Tracking, Periodic Reports, Optimized Chatbox.
- Medium priority: Voice Chat V1 (one-way voice).
- Backlog: Proactive AI, Multi-Agent Architecture.

## 2. Modules

| Module           | Framework / Technology | Language   | Core Packages                                                                                                                                                                                    | Purpose                                                                                                                    |
| ---------------- | ---------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Backend          | NestJS                 | TypeScript | `@google/genai`, `googleapis`, `google-auth-library`, `@nestjs/jwt`, `@nestjs/passport` + `passport-jwt`, `argon2`, `@nestjs/schedule`, `Prisma`, `Zod`, `class-validator` / `class-transformer` | Provides REST APIs, user authentication, AI model integration, Google APIs interaction, and background jobs [S1 §1.2] [S2] |
| Frontend (Web)   | Next.js (App Router)   | TypeScript | Vercel AI SDK                                                                                                                                                                                    | Web client of the system [S1 §1.2]                                                                                         |
| Mobile           | React Native           | TypeScript | Not specified                                                                                                                                                                                    | Mobile client of the system [S1 §1.2]                                                                                      |
| Database (RDBMS) | MySQL + Prisma ORM     | —          | Prisma                                                                                                                                                                                           | Stores User, Chat History, Settings, Raw Emails, Events [S1 §1.2]                                                          |
| Vector Database  | pgvector or Qdrant     | —          | Not specified                                                                                                                                                                                    | Stores and retrieves Knowledge Base and Semantic Memory via embeddings [S1 §1.2]                                           |
| AI Engine        | Gemini AI API          | —          | `@google/genai` (backend SDK)                                                                                                                                                                    | Rules, NLP, function calling, memory extraction, context management [S1 §1.2] [S2]                                         |
| Audio Synthesis  | Fish.audio API         | —          | Not specified                                                                                                                                                                                    | One-way Text-to-Speech (TTS) [S1 §1.2]                                                                                     |
| Deployment       | Docker                 | —          | —                                                                                                                                                                                                | Hosts the system (local/VPS DB) [S1 §1.2]                                                                                  |

## 3. Open Points

| Topic                      | Detail                                                                  |
| -------------------------- | ----------------------------------------------------------------------- |
| Mobile platform            | [S3] states React Native for iOS/Android; [S1] states Android only.     |
| Frontend / Mobile purpose  | The sources give no description beyond "Web" and "Mobile" client roles. |
| `documents/server/rule.md` | Empty.                                                                  |
