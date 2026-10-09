sequenceDiagram
autonumber
actor User as User / Admin
participant Google as Google Server (Pub/Sub)
participant Ctrl as EmailController
participant Service as EmailService / EmailRuleService
participant Queue as Redis / BullMQ (email-processing)
participant Worker as EmailProcessor (Worker)
participant DB as PostgreSQL (Prisma)

    %% -------------------------------------------------------------
    %% LUỒNG 1: QUẢN LÝ EMAIL RULES (CRUD)
    %% -------------------------------------------------------------
    rect rgb(240, 248, 255)
    note over User, DB: LUỒNG 1: QUẢN LÝ EMAIL RULES (REST API)
    User->>Ctrl: POST /api/v1/email-rules (Tạo Rule: blacklist/moneylist/whitelist)
    Ctrl->>Service: emailRuleService.create(dto)
    Service->>DB: INSERT INTO email_rules
    DB-->>Service: EmailRule Record
    Service-->>Ctrl: EmailRule Record
    Ctrl-->>User: 201 Created { statusCode, message, data }
    end

    %% -------------------------------------------------------------
    %% LUỒNG 2: WEBHOOK INGESTION & PRODUCER
    %% -------------------------------------------------------------
    rect rgb(255, 245, 238)
    note over Google, Queue: LUỒNG 2: TIẾP NHẬN EMAIL WEBHOOK & PRODUCER
    Google->>Ctrl: POST /api/v1/email/webhook (EmailWebhookDto: messageId, sender, rawBody...)
    Ctrl->>Service: emailService.createEmailLog(dto)

    rect rgb(255, 250, 205)
    note over Service, DB: Kiểm tra Idempotency (Chống trùng lặp)
    Service->>Service: TÍnh dedupHash = SHA256(messageId + rawBody)
    Service->>DB: SELECT FROM email_logs WHERE messageId OR dedupHash
    alt Email đã tồn tại (Duplicate)
        DB-->>Service: EmailLog Record
        Service-->>Ctrl: return null
        Ctrl-->>Google: 200 OK (Bỏ qua - Duplicate Email)
    else Email chưa tồn tại (Valid)
        DB-->>Service: null
        Service->>DB: INSERT INTO email_logs (status: PENDING)[cite: 1]
        DB-->>Service: New EmailLog Record
        Service-->>Ctrl: New EmailLog Record
        Ctrl->>Queue: emailQueue.add('process-email-job', payload)
        Queue-->>Ctrl: Job ID
        Ctrl-->>Google: 200 OK { emailLogId, jobId }
    end
    end
    end

    %% -------------------------------------------------------------
    %% LUỒNG 3: BULLMQ WORKER XỬ LÝ NGẦM
    %% -------------------------------------------------------------
    rect rgb(245, 255, 250)
    note over Queue, DB: LUỒNG 3: XỬ LÝ NGẦM VÀ PHÂN LOẠI EMAIL (BULLMQ WORKER)
    Queue->>Worker: Job 'process-email-job'
    Worker->>DB: SELECT FROM email_rules WHERE isActive = true[cite: 1]
    DB-->>Worker: List<EmailRule>

    Worker->>Worker: Khớp dữ liệu (sender / keyword / regex)[cite: 1]

    alt Khớp BLACKLIST
        Worker->>DB: UPDATE email_logs SET status = 'SKIPPED'[cite: 1]
    else Khớp MONEYLIST
        Worker->>DB: UPDATE email_logs SET status = 'PROCESSED'[cite: 1]
        note over Worker: Chuẩn bị Hook kích hoạt trích xuất tài chính (Bước 4)[cite: 1]
    else Khớp WHITELIST
        Worker->>DB: UPDATE email_logs SET status = 'PROCESSED'[cite: 1]
        note over Worker: Chuẩn bị Hook trích xuất sự kiện Lịch / AI Memory (Bước 5 & 6)[cite: 1]
    else Không khớp Rule nào
        Worker->>DB: UPDATE email_logs SET status = 'SKIPPED'[cite: 1]
    end

    DB-->>Worker: Updated EmailLog
    Worker-->>Queue: Complete Job
    end
