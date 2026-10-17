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
  @ApiOperation({ summary: 'Tạo mới một Character' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Tạo Character thành công.',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Dữ liệu đầu vào không hợp lệ.',
  })
  async createCharacter(@Body() createCharacterDto: CreateCharacterDto) {
    const data =
      await this.characterService.createCharacter(createCharacterDto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Tạo Character thành công',
      data,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách tất cả Character' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lấy danh sách Character thành công.',
  })
  async findAllCharacters() {
    const data = await this.characterService.findAllCharacters();
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách Character thành công',
      data,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết một Character theo ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lấy thông tin Character thành công.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy Character.',
  })
  async findCharacterById(@Param('id') id: string) {
    const data = await this.characterService.findCharacterById(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin Character thành công',
      data,
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật thông tin Character' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cập nhật Character thành công.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy Character.',
  })
  async updateCharacter(
    @Param('id') id: string,
    @Body() updateCharacterDto: UpdateCharacterDto,
  ) {
    const data = await this.characterService.updateCharacter(
      id,
      updateCharacterDto,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật Character thành công',
      data,
    };
  }

  @Delete(':id')
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
    const data = await this.characterService.removeCharacter(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa Character thành công',
      data,
    };
  }
}
