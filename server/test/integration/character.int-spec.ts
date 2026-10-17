import { NotFoundException } from '@nestjs/common';
import { PersonaType } from '@prisma/client';
import { CharacterService } from '../../src/character/character.service';
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

  const seedPersona = (characterId: string, data: Record<string, unknown> = {}) =>
    ctx.prisma.persona.create({ data: { characterId, type: PersonaType.TONE, value: 'calm', ...data } });

  describe('createCharacter', () => {
    it('persists the character with an empty persona list', async () => {
      const result = await service.createCharacter({
        name: 'Mari',
        voiceId: 'v1',
        source: 'Blue Archive',
        memoryRule: 'keep facts',
      });

      expect(result).toMatchObject({
        name: 'Mari',
        voiceId: 'v1',
        source: 'Blue Archive',
        memoryRule: 'keep facts',
        personas: [],
      });
      const row = await ctx.prisma.character.findUniqueOrThrow({ where: { id: result.id } });
      expect(row).toMatchObject({ name: 'Mari', voiceId: 'v1', source: 'Blue Archive', memoryRule: 'keep facts' });
    });

    it('leaves optional fields null', async () => {
      const result = await service.createCharacter({ name: 'Solo' });

      expect(result).toMatchObject({ voiceId: null, source: null, memoryRule: null });
    });
  });

  describe('findAllCharacters', () => {
    it('returns an empty list when there are none', async () => {
      expect(await service.findAllCharacters()).toEqual([]);
    });

    it('returns newest first, each with its personas', async () => {
      const older = await seedCharacter(ctx.prisma, { name: 'Old', createdAt: new Date('2024-01-01T00:00:00Z') });
      const newer = await seedCharacter(ctx.prisma, { name: 'New', createdAt: new Date('2025-01-01T00:00:00Z') });
      await seedPersona(older.id);

      const result = await service.findAllCharacters();

      expect(result.map((c) => c.id)).toEqual([newer.id, older.id]);
      expect(result[0].personas).toHaveLength(0);
      expect(result[1].personas).toHaveLength(1);
    });
  });

  describe('findCharacterById', () => {
    it('returns the character with its personas', async () => {
      const character = await seedCharacter(ctx.prisma);
      const persona = await seedPersona(character.id);

      const result = await service.findCharacterById(character.id);

      expect(result.id).toBe(character.id);
      expect(result.personas.map((p) => p.id)).toEqual([persona.id]);
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

    it('throws 404 for an unknown id and changes nothing', async () => {
      const character = await seedCharacter(ctx.prisma);

      await expect(service.updateCharacter(MISSING, { name: 'x' })).rejects.toThrow(NotFoundException);

      expect((await ctx.prisma.character.findUniqueOrThrow({ where: { id: character.id } })).name).toBe('Mika');
    });
  });

  describe('removeCharacter', () => {
    it('deletes the character and cascades its personas only', async () => {
      const doomed = await seedCharacter(ctx.prisma);
      const kept = await seedCharacter(ctx.prisma, { name: 'Keep' });
      await seedPersona(doomed.id);
      await seedPersona(doomed.id, { type: PersonaType.IDENTITY });
      const keptPersona = await seedPersona(kept.id);

      await service.removeCharacter(doomed.id);

      expect(await ctx.prisma.character.findUnique({ where: { id: doomed.id } })).toBeNull();
      expect(await ctx.prisma.persona.count({ where: { characterId: doomed.id } })).toBe(0);
      expect((await ctx.prisma.persona.findMany()).map((p) => p.id)).toEqual([keptPersona.id]);
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

  describe('addPersona', () => {
    it('creates the persona under the character', async () => {
      const character = await seedCharacter(ctx.prisma);

      const result = await service.addPersona(character.id, { type: PersonaType.IDENTITY, value: 'a maid' });

      expect(result).toMatchObject({ characterId: character.id, type: PersonaType.IDENTITY, value: 'a maid' });
      const rows = await ctx.prisma.persona.findMany({ where: { characterId: character.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(result.id);
    });

    it('throws 404 for an unknown character and creates nothing', async () => {
      await expect(service.addPersona(MISSING, { type: PersonaType.TONE, value: 'x' })).rejects.toThrow(
        NotFoundException,
      );

      expect(await ctx.prisma.persona.count()).toBe(0);
    });
  });

  describe('updatePersona', () => {
    it('updates the persona value in the database', async () => {
      const character = await seedCharacter(ctx.prisma);
      const persona = await seedPersona(character.id, { value: 'old' });

      const result = await service.updatePersona(character.id, persona.id, { value: 'new' });

      expect(result).toMatchObject({ id: persona.id, value: 'new', type: PersonaType.TONE });
      expect((await ctx.prisma.persona.findUniqueOrThrow({ where: { id: persona.id } })).value).toBe('new');
    });

    it('throws 404 for a persona of another character and leaves it unchanged', async () => {
      const mine = await seedCharacter(ctx.prisma);
      const theirs = await seedCharacter(ctx.prisma, { name: 'Other' });
      const persona = await seedPersona(theirs.id, { value: 'secret' });

      await expect(service.updatePersona(mine.id, persona.id, { value: 'hacked' })).rejects.toThrow(
        NotFoundException,
      );

      expect((await ctx.prisma.persona.findUniqueOrThrow({ where: { id: persona.id } })).value).toBe('secret');
    });

    it('throws 404 for an unknown persona', async () => {
      const character = await seedCharacter(ctx.prisma);

      await expect(service.updatePersona(character.id, MISSING, { value: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('throws 404 for an unknown character', async () => {
      await expect(service.updatePersona(MISSING, MISSING, { value: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('removePersona', () => {
    it('deletes only the given persona', async () => {
      const character = await seedCharacter(ctx.prisma);
      const gone = await seedPersona(character.id);
      const stays = await seedPersona(character.id, { type: PersonaType.OTHER });

      await service.removePersona(character.id, gone.id);

      expect((await ctx.prisma.persona.findMany()).map((p) => p.id)).toEqual([stays.id]);
      expect(await ctx.prisma.character.count()).toBe(1);
    });

    it('throws 404 for a persona of another character and keeps it', async () => {
      const mine = await seedCharacter(ctx.prisma);
      const theirs = await seedCharacter(ctx.prisma, { name: 'Other' });
      const persona = await seedPersona(theirs.id);

      await expect(service.removePersona(mine.id, persona.id)).rejects.toThrow(NotFoundException);

      expect(await ctx.prisma.persona.count()).toBe(1);
    });

    it('throws 404 for an unknown persona', async () => {
      const character = await seedCharacter(ctx.prisma);

      await expect(service.removePersona(character.id, MISSING)).rejects.toThrow(NotFoundException);
    });
  });
});
