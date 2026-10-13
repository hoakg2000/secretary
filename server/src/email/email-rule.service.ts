import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmailRuleDto } from './dto/create-email-rule.dto';
import { UpdateEmailRuleDto } from './dto/update-email-rule.dto';

@Injectable()
export class EmailRuleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createEmailRuleDto: CreateEmailRuleDto) {
    return this.prisma.emailRule.create({
      data: createEmailRuleDto,
    });
  }

  async findAll() {
    return this.prisma.emailRule.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const rule = await this.prisma.emailRule.findUnique({
      where: { id },
    });
    if (!rule) {
      throw new NotFoundException(`Không tìm thấy Email Rule với ID: ${id}`);
    }
    return rule;
  }

  async update(id: string, updateEmailRuleDto: UpdateEmailRuleDto) {
    await this.findOne(id);
    return this.prisma.emailRule.update({
      where: { id },
      data: updateEmailRuleDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.emailRule.delete({
      where: { id },
    });
  }
}
