import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { renderCharacterPrompt, seedCharacters } from '../../prisma/seed-characters';
import { CharacterService } from '../../src/character/character.service';
import { CreateCharacterDto } from '../../src/character/dto/create-character.dto';
import { UpdateCharacterDto } from '../../src/character/dto/update-character.dto';
import { MISSING, createTestModule, resetState, seedCharacter, seedUser, type TestContext } from './harness';

describe('character integration', () => {
  let ctx: TestContext;
  let service: CharacterService;

  beforeAll(async () => {
    ctx = await createTestModule();
    service = ctx.moduleRef.get(CharacterService);
  });

  afterAll(() => ctx.close());

  beforeEach(() => resetState(ctx));

  describe('createCharacter', () => {
    it('persists the character fields including systemPrompt', async () => {
      const result = await service.createCharacter({
        name: 'Mari',
        voiceId: 'v1',
        source: 'Blue Archive',
        memoryRule: 'keep facts',
        systemPrompt: 'Gentle nun.',
      });

      expect(result).toMatchObject({
        name: 'Mari',
        voiceId: 'v1',
        source: 'Blue Archive',
        memoryRule: 'keep facts',
        systemPrompt: 'Gentle nun.',
      });
      const row = await ctx.prisma.character.findUniqueOrThrow({ where: { id: result.id } });
      expect(row).toMatchObject({
        name: 'Mari',
        voiceId: 'v1',
        source: 'Blue Archive',
        memoryRule: 'keep facts',
        systemPrompt: 'Gentle nun.',
      });
    });

    it('leaves optional fields null', async () => {
      const result = await service.createCharacter({ name: 'Solo' });

      expect(result).toMatchObject({ voiceId: null, source: null, memoryRule: null, systemPrompt: null, slug: null });
    });
  });

  describe('findAllCharacters', () => {
    it('returns an empty list when there are none', async () => {
      expect(await service.findAllCharacters()).toEqual([]);
    });

    it('returns newest first', async () => {
      const older = await seedCharacter(ctx.prisma, { name: 'Old', createdAt: new Date('2024-01-01T00:00:00Z') });
      const newer = await seedCharacter(ctx.prisma, { name: 'New', createdAt: new Date('2025-01-01T00:00:00Z') });

      const result = await service.findAllCharacters();

      expect(result.map((c) => c.id)).toEqual([newer.id, older.id]);
    });
  });

  describe('findCharacterById', () => {
    it('returns the character with its systemPrompt', async () => {
      const character = await seedCharacter(ctx.prisma, { systemPrompt: 'Calm.' });

      const result = await service.findCharacterById(character.id);

      expect(result.id).toBe(character.id);
      expect(result.systemPrompt).toBe('Calm.');
    });

    it('throws 404 for an unknown id', async () => {
      await expect(service.findCharacterById(MISSING)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateCharacter', () => {
    it('updates only the given fields and persists them', async () => {
      const character = await seedCharacter(ctx.prisma, { name: 'Before', source: 'Src' });

      const result = await service.updateCharacter(character.id, { name: 'After' });

      expect(result).toMatchObject({ name: 'After', source: 'Src', voiceId: 'voice-1' });
      const row = await ctx.prisma.character.findUniqueOrThrow({ where: { id: character.id } });
      expect(row).toMatchObject({ name: 'After', source: 'Src' });
    });

    it('sets systemPrompt', async () => {
      const character = await seedCharacter(ctx.prisma);

      const result = await service.updateCharacter(character.id, { systemPrompt: 'New prompt' });

      expect(result.systemPrompt).toBe('New prompt');
      const row = await ctx.prisma.character.findUniqueOrThrow({ where: { id: character.id } });
      expect(row.systemPrompt).toBe('New prompt');
    });

    it('clears systemPrompt when updated to an empty string', async () => {
      const character = await seedCharacter(ctx.prisma, { systemPrompt: 'Old prompt' });

      await service.updateCharacter(character.id, { systemPrompt: '' });

      const row = await ctx.prisma.character.findUniqueOrThrow({ where: { id: character.id } });
      expect(row.systemPrompt).toBe('');
    });

    it('keeps systemPrompt when the update does not mention it', async () => {
      const character = await seedCharacter(ctx.prisma, { systemPrompt: 'Keep me' });

      await service.updateCharacter(character.id, { name: 'Renamed' });

      const row = await ctx.prisma.character.findUniqueOrThrow({ where: { id: character.id } });
      expect(row.systemPrompt).toBe('Keep me');
    });

    it('rejects name: null in the update DTO (400) and leaves the row unchanged; nullable fields accept null', async () => {
      const character = await seedCharacter(ctx.prisma, { name: 'Stable' });

      const errors = await validate(plainToInstance(UpdateCharacterDto, { name: null }));

      expect(errors.map((e) => e.property)).toEqual(['name']);
      expect(await validate(plainToInstance(UpdateCharacterDto, { systemPrompt: null, voiceId: null }))).toEqual([]);
      expect((await ctx.prisma.character.findUniqueOrThrow({ where: { id: character.id } })).name).toBe('Stable');
    });

    it('throws 404 for an unknown id and changes nothing', async () => {
      const character = await seedCharacter(ctx.prisma);

      await expect(service.updateCharacter(MISSING, { name: 'x' })).rejects.toThrow(NotFoundException);

      expect((await ctx.prisma.character.findUniqueOrThrow({ where: { id: character.id } })).name).toBe('Mika');
    });
  });

  describe('removeCharacter', () => {
    it('deletes only the given character', async () => {
      const doomed = await seedCharacter(ctx.prisma);
      const kept = await seedCharacter(ctx.prisma, { name: 'Keep' });

      await service.removeCharacter(doomed.id);

      expect(await ctx.prisma.character.findUnique({ where: { id: doomed.id } })).toBeNull();
      expect((await ctx.prisma.character.findMany()).map((c) => c.id)).toEqual([kept.id]);
    });

    it('keeps chat sessions but nulls their character_id', async () => {
      const character = await seedCharacter(ctx.prisma);
      const user = await seedUser(ctx.prisma);
      const session = await ctx.prisma.chatSession.create({
        data: { userId: user.id, characterId: character.id, title: 'hi' },
      });

      await service.removeCharacter(character.id);

      const row = await ctx.prisma.chatSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(row.characterId).toBeNull();
      expect(row.title).toBe('hi');
    });

    it('throws 404 for an unknown id', async () => {
      await expect(service.removeCharacter(MISSING)).rejects.toThrow(NotFoundException);
    });
  });

  describe('DTO validation (enforced by the ValidationPipe, checked with class-validator)', () => {
    const create = (plain: object) => plainToInstance(CreateCharacterDto, { name: 'Mari', ...plain });

    it('accepts a systemPrompt of exactly 20000 characters', async () => {
      expect(await validate(create({ systemPrompt: 'a'.repeat(20000) }))).toHaveLength(0);
    });

    it('rejects a systemPrompt longer than 20000 characters on create', async () => {
      const errors = await validate(create({ systemPrompt: 'a'.repeat(20001) }));

      expect(errors.map((e) => e.property)).toEqual(['systemPrompt']);
    });

    it('rejects a systemPrompt longer than 20000 characters on update', async () => {
      const dto = plainToInstance(UpdateCharacterDto, { systemPrompt: 'a'.repeat(20001) });

      expect((await validate(dto)).map((e) => e.property)).toEqual(['systemPrompt']);
    });

    it('rejects a non-string systemPrompt', async () => {
      expect(await validate(create({ systemPrompt: 123 }))).not.toHaveLength(0);
    });

    it('strips slug on create under the whitelist option used by the ValidationPipe', async () => {
      const dto = create({ slug: 'hacked' });

      await validate(dto, { whitelist: true });

      expect(dto).not.toHaveProperty('slug');
    });

    it('strips slug on update under the whitelist option used by the ValidationPipe', async () => {
      const dto = plainToInstance(UpdateCharacterDto, { slug: 'hacked', name: 'X' });

      await validate(dto, { whitelist: true });

      expect(dto).toMatchObject({ name: 'X' });
      expect(dto).not.toHaveProperty('slug');
    });
  });

  describe('seedCharacters', () => {
    const tmpDirs: string[] = [];
    const tmpDir = () => {
      const dir = mkdtempSync(join(tmpdir(), 'characters-'));
      tmpDirs.push(dir);
      return dir;
    };
    afterAll(() => tmpDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

    it('creates iochi_mari from the real documents/characters folder', async () => {
      const slugs = await seedCharacters(ctx.prisma);

      expect(slugs).toContain('iochi_mari');
      const row = await ctx.prisma.character.findUniqueOrThrow({ where: { slug: 'iochi_mari' } });
      expect(row).toMatchObject({
        name: 'Iochi Mari',
        source: 'Blue Archive',
        voiceId: 'a486dffae545463abb96c8ff9765fb43',
      });
      for (const heading of [
        'Identity',
        'Personality',
        'Relationships',
        'Background',
        'World',
        'Speaking style',
        'Sample dialogues',
        'Rules',
      ]) {
        expect(row.systemPrompt).toContain(`### ${heading}`);
      }
      expect(row.systemPrompt).not.toContain('bluearchive.wiki');
    });

    it('keeps one row on a second run and overwrites a manually changed systemPrompt', async () => {
      await seedCharacters(ctx.prisma);
      const before = await ctx.prisma.character.findUniqueOrThrow({ where: { slug: 'iochi_mari' } });
      await ctx.prisma.character.update({ where: { id: before.id }, data: { systemPrompt: 'edited by hand' } });

      await seedCharacters(ctx.prisma);

      expect(await ctx.prisma.character.count({ where: { slug: 'iochi_mari' } })).toBe(1);
      const after = await ctx.prisma.character.findUniqueOrThrow({ where: { slug: 'iochi_mari' } });
      expect(after.id).toBe(before.id);
      expect(after.systemPrompt).toBe(before.systemPrompt);
    });

    it('rejects a file without slug, naming the file, and writes nothing', async () => {
      const dir = tmpDir();
      writeFileSync(join(dir, 'broken_one.json'), JSON.stringify({ name: 'No Slug', profile: { identity: { a: 'b' } } }));

      await expect(seedCharacters(ctx.prisma, dir)).rejects.toThrow(/broken_one\.json/);

      expect(await ctx.prisma.character.count()).toBe(0);
    });

    it('writes nothing when a later file is broken (validates every file first)', async () => {
      const dir = tmpDir();
      writeFileSync(join(dir, 'a_good.json'), JSON.stringify({ slug: 'good', name: 'Good', profile: {} }));
      writeFileSync(join(dir, 'b_bad.json'), JSON.stringify({ slug: 'bad', name: 'Bad', profile: { world: 'not a list' } }));

      await expect(seedCharacters(ctx.prisma, dir)).rejects.toThrow(/b_bad\.json.*profile\.world must be an array/);

      expect(await ctx.prisma.character.count()).toBe(0);
    });

    it.each([
      [{ slug: 123, name: 'N', profile: {} }, /slug and name/],
      [{ slug: 's', name: 'N', voiceId: 5, profile: {} }, /voiceId/],
      [{ slug: 's', name: 'N', profile: 'text' }, /profile must be an object/],
    ])('rejects wrongly typed fields with the file name (%j)', async (data, message) => {
      const dir = tmpDir();
      writeFileSync(join(dir, 'typed.json'), JSON.stringify(data));

      await expect(seedCharacters(ctx.prisma, dir)).rejects.toThrow(/typed\.json/);
      await expect(seedCharacters(ctx.prisma, dir)).rejects.toThrow(message);
    });

    it('rejects two files with the same slug and writes nothing', async () => {
      const dir = tmpDir();
      writeFileSync(join(dir, 'one.json'), JSON.stringify({ slug: 'dup', name: 'One', profile: {} }));
      writeFileSync(join(dir, 'two.json'), JSON.stringify({ slug: 'dup', name: 'Two', profile: {} }));

      await expect(seedCharacters(ctx.prisma, dir)).rejects.toThrow(/Duplicate character slug "dup" in one\.json and two\.json/);

      expect(await ctx.prisma.character.count()).toBe(0);
    });

    it('rejects a file with invalid JSON, naming the file', async () => {
      const dir = tmpDir();
      writeFileSync(join(dir, 'garbage.json'), '{ not json');

      await expect(seedCharacters(ctx.prisma, dir)).rejects.toThrow(/garbage\.json/);
    });

    it('ignores non-json files and subfolders', async () => {
      const dir = tmpDir();
      writeFileSync(join(dir, 'notes.txt'), 'hello');
      mkdirSync(join(dir, 'sub'));

      expect(await seedCharacters(ctx.prisma, dir)).toEqual([]);
    });
  });

  describe('renderCharacterPrompt', () => {
    it('skips empty sections', () => {
      const text = renderCharacterPrompt({
        identity: { fullName: 'Mari', age: '' },
        personality: { core: [] },
        relationships: [],
        rules: { do: ['Be kind'] },
      });

      expect(text).toBe('### Identity\n- Full name: Mari\n\n### Rules\nDo:\n- Be kind');
    });

    it('returns an empty string for an empty profile', () => {
      expect(renderCharacterPrompt({})).toBe('');
    });
  });
});
