// Creates or updates the master user from MASTER_EMAIL / MASTER_PASSWORD.
// Run with `npm run seed`. Executed by Node's type stripping: keep this file free of
// enums, decorators and parameter properties.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import pg from 'pg';

async function main() {
  const email = process.env.MASTER_EMAIL;
  const password = process.env.MASTER_PASSWORD;

  if (!email || !password) {
    console.error('MASTER_EMAIL and MASTER_PASSWORD must be set to seed the master user.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, passwordHash },
    });
    console.log(`Master user ready: ${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
