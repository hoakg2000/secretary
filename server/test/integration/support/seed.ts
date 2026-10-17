import { randomUUID } from 'node:crypto';
import { EmailMatcher, EmailRuleType } from '@prisma/client';
import type { GoogleClientFactory } from '../../../src/auth/google-client.factory';
import type { PrismaService } from '../../../src/prisma/prisma.service';

export function seedUser(prisma: PrismaService, data: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: { email: `${randomUUID()}@test.local`, ...data },
  });
}

export function seedAccount(prisma: PrismaService, data: Record<string, unknown> = {}) {
  return prisma.bankAccount.create({
    data: {
      accountName: 'Main',
      bankCode: 'VCB',
      accountNumber: '0011223344',
      cachedBalance: 1000000,
      ...data,
    },
  });
}

export function seedCharacter(prisma: PrismaService, data: Record<string, unknown> = {}) {
  return prisma.character.create({
    data: { name: 'Mika', voiceId: 'voice-1', ...data },
  });
}

/** A user with encrypted Google tokens stored through the real GoogleClientFactory */
export async function seedGoogleUser(
  prisma: PrismaService,
  googleClientFactory: GoogleClientFactory,
  tokens: { access_token?: string; refresh_token?: string; expiry_date?: number } = {},
  data: Record<string, unknown> = {},
) {
  const user = await seedUser(prisma, data);
  await googleClientFactory.saveTokens(user.id, {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expiry_date: Date.now() + 3_600_000,
    ...tokens,
  });
  return prisma.user.findUniqueOrThrow({ where: { id: user.id } });
}

export function seedEvent(prisma: PrismaService, data: Record<string, unknown> = {}) {
  const startTime = new Date('2030-01-01T09:00:00Z');
  return prisma.localCalendar.create({
    data: {
      title: 'Meeting',
      startTime,
      endTime: new Date(startTime.getTime() + 3_600_000),
      ...data,
    },
  });
}

export function seedEmailRule(prisma: PrismaService, data: Record<string, unknown> = {}) {
  return prisma.emailRule.create({
    data: {
      type: EmailRuleType.whitelist,
      matcher: EmailMatcher.sender,
      matchValue: 'boss@example.com',
      ...data,
    },
  });
}

/** A well-formed uuid that no seeded row has */
export const MISSING = '00000000-0000-0000-0000-000000000000';
