// Seed script: creates a default admin and a sample wechat_apps row.
//
// Usage: npm run db:seed
// Or: npx prisma db seed (after configuring prisma.seed in package.json)

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { encrypt } from '../src/lib/crypto.js';

const prisma = new PrismaClient();

async function main() {
  // Default admin (change in production!)
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.admin.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      name: 'Default Admin',
      role: 'admin',
    },
  });
  console.log(`✓ admin: ${admin.email} (${admin.id})`);

  // Sample wechat_apps row — uses placeholder credentials. The user replaces
  // these via the settings page.
  const sample = await prisma.wechatApp.upsert({
    where: { appId: 'sample-app-id' },
    update: {},
    create: {
      name: '示例公众号（请编辑）',
      appId: 'sample-app-id',
      appSecretEnc: encrypt('sample-app-secret-replace-me'),
      token: 'sample-token',
      encodingAesKey: encrypt('sample-encoding-aes-key-43-chars-aaaaaaaaaaa'),
      type: 'subscription',
      disabled: true,
    },
  });
  console.log(`✓ wechat_app: ${sample.name} (${sample.id}, disabled)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
