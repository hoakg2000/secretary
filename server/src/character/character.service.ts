import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // Điều chỉnh đường dẫn PrismaService nếu cần
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';

@Injectable()
export class CharacterService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== CHARACTER LOGIC ====================

  async createCharacter(dto: CreateCharacterDto) {
    return this.prisma.character.create({ data: dto });
  }

  async findAllCharacters() {
    return this.prisma.character.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findCharacterById(id: string) {
    const character = await this.prisma.character.findUnique({
      where: { id },
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
    });
  }

  async removeCharacter(id: string) {
    await this.findCharacterById(id);

    return this.prisma.character.delete({
      where: { id },
    });
  }
}
