import type { Character } from '@prisma/client';

/**
 * Phần prompt của Character, bổ sung cho prompt mặc định; rỗng nếu không có Character hoặc systemPrompt
 */
export function buildCharacterPrompt(
  character: Pick<Character, 'name' | 'source' | 'systemPrompt'> | null,
): string {
  const prompt = character?.systemPrompt?.trim();
  if (!character || !prompt) return '';

  const source = character.source ? ` (Nguồn: ${character.source})` : '';
  return `## Nhân vật bạn đang nhập vai\nTên: ${character.name}${source}\n${prompt}`;
}
