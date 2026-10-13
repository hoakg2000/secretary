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
    if (dto.isActive) {
      await this.prisma.character.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }

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

    if (dto.isActive) {
      await this.prisma.character.updateMany({
        where: { id: { not: id }, isActive: true },
        data: { isActive: false },
      });
    }

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

  async setActiveCharacter(id: string) {
    await this.findCharacterById(id);

    await this.prisma.character.updateMany({
      data: { isActive: false },
    });

    return this.prisma.character.update({
      where: { id },
      data: { isActive: true },
      include: { personas: true },
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

  async updatePersona(personaId: string, dto: UpdatePersonaDto) {
    const persona = await this.prisma.persona.findUnique({
      where: { id: personaId },
    });

    if (!persona) {
      throw new NotFoundException(
        `Không tìm thấy Persona với ID: ${personaId}`,
      );
    }

    return this.prisma.persona.update({
      where: { id: personaId },
      data: dto,
    });
  }

  async removePersona(personaId: string) {
    const persona = await this.prisma.persona.findUnique({
      where: { id: personaId },
    });

    if (!persona) {
      throw new NotFoundException(
        `Không tìm thấy Persona với ID: ${personaId}`,
      );
    }

    return this.prisma.persona.delete({
      where: { id: personaId },
    });
  }
}
