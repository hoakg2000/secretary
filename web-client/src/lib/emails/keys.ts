export const EMAIL_LOGS_KEY = ["emails", "logs"] as const;
export const emailLogKey = (id: string) => ["emails", "log", id] as const;
export const EMAIL_RULES_KEY = ["emails", "rules"] as const;
