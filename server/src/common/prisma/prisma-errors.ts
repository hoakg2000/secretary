import { Prisma } from '@prisma/client';

/** P2002: vi phạm unique constraint */
export const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';
