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
import { CreatePersonaDto } from './dto/create-persona.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { UpdatePersonaDto } from './dto/update-persona.dto';

@ApiTags('Characters & Personas')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/characters')
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

  @Patch(':id/active')
  @ApiOperation({
    summary: 'Đặt Character làm nhân vật hoạt động chính (Active)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Kích hoạt Character thành công.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy Character.',
  })
  async setActiveCharacter(@Param('id') id: string) {
    const data = await this.characterService.setActiveCharacter(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Kích hoạt Character thành công',
      data,
    };
  }

  // ==================== PERSONA ENDPOINTS ====================

  @Post(':id/personas')
  @ApiOperation({ summary: 'Thêm một Persona cho Character' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Thêm Persona thành công.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy Character.',
  })
  async addPersona(
    @Param('id') characterId: string,
    @Body() createPersonaDto: CreatePersonaDto,
  ) {
    const data = await this.characterService.addPersona(
      characterId,
      createPersonaDto,
    );
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Thêm Persona thành công',
      data,
    };
  }

  @Patch(':id/personas/:personaId')
  @ApiOperation({ summary: 'Cập nhật nội dung Persona' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cập nhật Persona thành công.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy Persona.',
  })
  async updatePersona(
    @Param('id') characterId: string,
    @Param('personaId') personaId: string,
    @Body() updatePersonaDto: UpdatePersonaDto,
  ) {
    const data = await this.characterService.updatePersona(
      characterId,
      personaId,
      updatePersonaDto,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật Persona thành công',
      data,
    };
  }

  @Delete(':id/personas/:personaId')
  @ApiOperation({ summary: 'Xóa Persona' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Xóa Persona thành công.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy Persona.',
  })
  async removePersona(
    @Param('id') characterId: string,
    @Param('personaId') personaId: string,
  ) {
    const data = await this.characterService.removePersona(
      characterId,
      personaId,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Xóa Persona thành công',
      data,
    };
  }
}
