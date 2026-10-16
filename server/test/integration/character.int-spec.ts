import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { CharacterService } from '../../src/character/character.service';
import { createTestModule, resetDb, seedUser, TestContext } from './harness';

let ctx: TestContext;
let characters: CharacterService;

beforeAll(async () => {
  ctx = await createTestModule();
  characters = ctx.moduleRef.get(CharacterService);
});
beforeEach(() => resetDb(ctx.prisma));
afterAll(() => ctx.moduleRef.close());

describe('integration harness', () => {
  it('process.env wins over server/.env inside ConfigModule', () => {
    const config = ctx.moduleRef.get(ConfigService);
    expect(config.get('GEMINI_API_KEY')).toBe('test');
    expect(config.get('TELEGRAM_BOT_TOKEN')).toBe('test');
    expect(config.get('FISH_AUDIO_API_KEY')).toBe('test');
    expect(config.get('GOOGLE_CLIENT_SECRET')).toBe('test-client-secret');
    expect(config.get('DATABASE_URL')).toMatch(/_test$/);
    expect(process.env.DATABASE_URL).toMatch(/_test$/);
  });

  it('runs on a *_test database', async () => {
    const [{ name }] = await ctx.prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    expect(name).toMatch(/_test$/);
  });

  it('any unmocked fetch throws', async () => {
    await expect(fetch('https://api.telegram.org/x')).rejects.toThrow(
      'unmocked fetch: https://api.telegram.org/x',
    );
  });
});

describe('CharacterService (integration)', () => {
  const activeNames = async () =>
    (await ctx.prisma.character.findMany({ where: { isActive: true } })).map((c) => c.name);

  it('createCharacter round trip', async () => {
    const created = await characters.createCharacter({ name: 'Mari' });
    expect(await ctx.prisma.character.findUnique({ where: { id: created.id } })).toMatchObject({
      name: 'Mari',
      isActive: false,
    });
  });

  it('keeps a single active character through create, update and setActive', async () => {
    const a = await characters.createCharacter({ name: 'A', isActive: true });
    const b = await characters.createCharacter({ name: 'B', isActive: true });
    expect(await activeNames()).toEqual(['B']);

    await characters.updateCharacter(a.id, { isActive: true });
    expect(await activeNames()).toEqual(['A']);

    await characters.setActiveCharacter(b.id);
    expect(await activeNames()).toEqual(['B']);
  });

  it('the database rejects a second active row (characters_single_active)', async () => {
    await ctx.prisma.character.create({ data: { name: 'A', isActive: true } });

    await expect(
      ctx.prisma.character.create({ data: { name: 'B', isActive: true } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('two concurrent setActiveCharacter leave one active character', async () => {
    const a = await characters.createCharacter({ name: 'A' });
    const b = await characters.createCharacter({ name: 'B' });
    await characters.createCharacter({ name: 'C', isActive: true });

    const results = await Promise.allSettled([
      characters.setActiveCharacter(a.id),
      characters.setActiveCharacter(b.id),
    ]);

    expect(await ctx.prisma.character.count({ where: { isActive: true } })).toBe(1);
    // A call that loses the race can only be stopped by the partial unique index
    for (const result of results) {
      if (result.status === 'rejected') expect(result.reason).toMatchObject({ code: 'P2002' });
    }
  });

  it('removeCharacter cascades personas and detaches chat sessions', async () => {
    const user = await seedUser(ctx.prisma);
    const character = await characters.createCharacter({ name: 'A' });
    await characters.addPersona(character.id, { type: 'TONE', value: 'calm' });
    const session = await ctx.prisma.chatSession.create({
      data: { userId: user.id, characterId: character.id },
    });

    await characters.removeCharacter(character.id);

    expect(await ctx.prisma.persona.count()).toBe(0);
    expect(await ctx.prisma.chatSession.findUnique({ where: { id: session.id } })).toMatchObject({
      characterId: null,
    });
  });

  it('a persona addressed through another character is not found', async () => {
    const a = await characters.createCharacter({ name: 'A' });
    const b = await characters.createCharacter({ name: 'B' });
    const persona = await characters.addPersona(a.id, { type: 'TONE', value: 'calm' });

    await expect(
      characters.updatePersona(b.id, persona.id, { value: 'changed' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(characters.removePersona(b.id, persona.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(await ctx.prisma.persona.findUnique({ where: { id: persona.id } })).toMatchObject({
      value: 'calm',
    });
  });

  it('unknown IDs are not found', async () => {
    const id = randomUUID();
    const character = await characters.createCharacter({ name: 'A' });

    for (const call of [
      () => characters.findCharacterById(id),
      () => characters.updateCharacter(id, { name: 'X' }),
      () => characters.removeCharacter(id),
      () => characters.setActiveCharacter(id),
      () => characters.addPersona(id, { type: 'TONE', value: 'calm' }),
      () => characters.updatePersona(character.id, id, { value: 'x' }),
      () => characters.removePersona(character.id, id),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(NotFoundException);
    }
  });
});
