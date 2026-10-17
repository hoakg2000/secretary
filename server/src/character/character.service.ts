import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // Điều chỉnh đường dẫn PrismaService nếu cần
import { CreateCharacterDto } from './dto/create-character.dto';
import { CreatePersonaDto } from './dto/create-persona.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { UpdatePersonaDto } from './dto/update-persona.dto';

@Injectable()
export class CharacterService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== CHARACTER LOGIC ====================

  async createCharacter(dto: CreateCharacterDto) {
    return this.prisma.character.create({
      data: dto,
      include: { personas: true },
    });
  }

  async findAllCharacters() {
    return this.prisma.character.findMany({
      include: { personas: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findCharacterById(id: string) {
    const character = await this.prisma.character.findUnique({
      where: { id },
      include: { personas: true },
    });

    if (!character) {
      throw new NotFoundException(`Không tìm thấy Character với ID: ${id}`);
    }

    return character;
  }

  async updateCharacter(id: string, dto: UpdateCharacterDto) {
    await this.findCharacterById(id);

    return this.prisma.character.update({
      where: { id },
      data: dto,
      include: { personas: true },
    });
  }

  async removeCharacter(id: string) {
    await this.findCharacterById(id);

    return this.prisma.character.delete({
      where: { id },
    });
  }

  // ==================== PERSONA LOGIC ====================

  async addPersona(characterId: string, dto: CreatePersonaDto) {
    await this.findCharacterById(characterId);

    return this.prisma.persona.create({
      data: {
        characterId,
        ...dto,
      },
    });
  }

  // Persona phải thuộc đúng Character trên URL
  private async findPersona(characterId: string, personaId: string) {
    const persona = await this.prisma.persona.findFirst({
      where: { id: personaId, characterId },
    });

    if (!persona) {
      throw new NotFoundException(
        `Không tìm thấy Persona với ID: ${personaId}`,
      );
    }

    return persona;
  }

  async updatePersona(
    characterId: string,
    personaId: string,
    dto: UpdatePersonaDto,
  ) {
    await this.findPersona(characterId, personaId);

    return this.prisma.persona.update({
      where: { id: personaId },
      data: dto,
    });
  }

  async removePersona(characterId: string, personaId: string) {
    await this.findPersona(characterId, personaId);

    return this.prisma.persona.delete({
      where: { id: personaId },
    });
  }
}
