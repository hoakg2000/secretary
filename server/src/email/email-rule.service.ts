import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EmailMatcher, EmailRuleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmailRuleDto } from './dto/create-email-rule.dto';
import { UpdateEmailRuleDto } from './dto/update-email-rule.dto';

const MAX_REGEX_LENGTH = 200;

// Thứ tự ưu tiên theo loại rule, không theo ngày tạo: blacklist thắng tất cả
const RULE_PRECEDENCE: EmailRuleType[] = [
  EmailRuleType.blacklist,
  EmailRuleType.moneylist,
  EmailRuleType.whitelist,
];

export interface ClassifiableEmail {
  sender: string;
  subject?: string | null;
  rawBody?: string | null;
}

@Injectable()
export class EmailRuleService {
  private readonly logger = new Logger(EmailRuleService.name);

  constructor(private readonly prisma: PrismaService) {}

  // shortcut: chỉ giới hạn độ dài + kiểm tra cú pháp, chưa chống ReDoS; chuyển sang re2 nếu rule không còn do chính chủ tạo
  private assertValidRegex(matcher: EmailMatcher, matchValue: string) {
    if (matcher !== EmailMatcher.regex) return;

    if (matchValue.length > MAX_REGEX_LENGTH) {
      throw new BadRequestException(
        `Regex không được dài quá ${MAX_REGEX_LENGTH} ký tự`,
      );
    }
    try {
      new RegExp(matchValue);
    } catch {
      throw new BadRequestException(`Regex không hợp lệ: ${matchValue}`);
    }
  }

  async create(createEmailRuleDto: CreateEmailRuleDto) {
    this.assertValidRegex(
      createEmailRuleDto.matcher,
      createEmailRuleDto.matchValue,
    );

    return this.prisma.emailRule.create({
      data: createEmailRuleDto,
    });
  }

  async findAll(type?: EmailRuleType) {
    return this.prisma.emailRule.findMany({
      where: { type },
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
    const rule = await this.findOne(id);
    this.assertValidRegex(
      updateEmailRuleDto.matcher ?? rule.matcher,
      updateEmailRuleDto.matchValue ?? rule.matchValue,
    );

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

  /**
   * Phân loại email theo các rule đang hoạt động.
   * Trả về loại rule có độ ưu tiên cao nhất khớp với email, hoặc null nếu không rule nào khớp.
   */
  async classify(email: ClassifiableEmail): Promise<EmailRuleType | null> {
    const rules = await this.prisma.emailRule.findMany({
      where: { isActive: true },
    });

    const matchedTypes = new Set(
      rules.filter((rule) => this.isMatched(rule, email)).map((r) => r.type),
    );

    return RULE_PRECEDENCE.find((type) => matchedTypes.has(type)) ?? null;
  }

  /**
   * Helper kiểm tra giá trị email có khớp với Rule hay không
   */
  private isMatched(
    rule: { matcher: EmailMatcher; matchValue: string },
    { sender, subject, rawBody }: ClassifiableEmail,
  ): boolean {
    const { matcher, matchValue } = rule;
    const targetText = matchValue.toLowerCase();

    switch (matcher) {
      case EmailMatcher.sender:
        return sender.toLowerCase().includes(targetText);

      case EmailMatcher.keyword: {
        const fullContent = `${subject || ''} ${rawBody || ''}`.toLowerCase();
        return fullContent.includes(targetText);
      }

      case EmailMatcher.regex: {
        try {
          const regex = new RegExp(matchValue, 'i');
          const fullContent = `${sender} ${subject || ''} ${rawBody || ''}`;
          return regex.test(fullContent);
        } catch {
          this.logger.error(`Regex không hợp lệ: ${matchValue}`);
          return false;
        }
      }

      default:
        return false;
    }
  }
}
