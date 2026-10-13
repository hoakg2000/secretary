import { defineConfig } from '@prisma/config';
import 'dotenv/config';

export default defineConfig({
  // earlyAccess: true,
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
