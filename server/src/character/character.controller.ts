import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CharacterService } from './character.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';

@ApiTags('Characters')
@ApiBearerAuth('JWT-auth')
@Controller('characters')
export class CharacterController {
  constructor(private readonly characterService: CharacterService) {}

  // ==================== CHARACTER ENDPOINTS ====================

  @Post()
  @ResponseMessage('Tạo Character thành công')
  @ApiOperation({ summary: 'Tạo mới một Character' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Tạo Character thành công.',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Dữ liệu đầu vào không hợp lệ.',
  })
  createCharacter(@Body() createCharacterDto: CreateCharacterDto) {
    return this.characterService.createCharacter(createCharacterDto);
  }

  @Get()
  @ResponseMessage('Lấy danh sách Character thành công')
  @ApiOperation({ summary: 'Lấy danh sách tất cả Character' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lấy danh sách Character thành công.',
  })
  findAllCharacters() {
    return this.characterService.findAllCharacters();
  }

  @Get(':id')
  @ResponseMessage('Lấy thông tin Character thành công')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết một Character theo ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lấy thông tin Character thành công.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy Character.',
  })
  findCharacterById(@Param('id') id: string) {
    return this.characterService.findCharacterById(id);
  }

  @Patch(':id')
  @ResponseMessage('Cập nhật Character thành công')
  @ApiOperation({ summary: 'Cập nhật thông tin Character' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cập nhật Character thành công.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy Character.',
  })
  updateCharacter(
    @Param('id') id: string,
    @Body() updateCharacterDto: UpdateCharacterDto,
  ) {
    return this.characterService.updateCharacter(id, updateCharacterDto);
  }

  @Delete(':id')
  @ResponseMessage('Xóa Character thành công')
  @ApiOperation({ summary: 'Xóa Character' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Xóa Character thành công.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy Character.',
  })
  async removeCharacter(@Param('id') id: string) {
    await this.characterService.removeCharacter(id);
  }
}
