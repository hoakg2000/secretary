// Loads documents/characters/*.json into the characters table (upsert by slug, the JSON wins).
// Executed by Node's type stripping: keep this file free of enums, decorators and parameter properties.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';

type Dict = Record<string, any>;

// @ts-expect-error tsc runs with module=commonjs; Node and Vitest load this file as ESM
const DEFAULT_DIR = fileURLToPath(new URL('../../documents/characters', import.meta.url));

function bullets(items: unknown): string[] {
  return Array.isArray(items) ? items.filter(Boolean).map((item) => `- ${item}`) : [];
}

// fullName -> "Full name": JSON keys are shown to the model as readable labels
function label(key: string): string {
  const words = key.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function section(title: string, lines: string[]): string {
  return lines.length ? `### ${title}\n${lines.join('\n')}` : '';
}

/** Renders the classified profile into one text block (the `sources` field is never included). */
export function renderCharacterPrompt(profile: Dict): string {
  const identity = Object.entries(profile.identity ?? {})
    .filter(([, value]) => value)
    .map(([key, value]) => `- ${label(key)}: ${value}`);

  const personality = Object.entries(profile.personality ?? {}).flatMap(([group, items]) =>
    bullets(items).length ? [`${label(group)}:`, ...bullets(items)] : [],
  );

  const relationships = (profile.relationships ?? []).map(
    (r: Dict) => `- ${r.name} (${r.role}): ${r.dynamic}`,
  );
  if (relationships.length) {
    relationships.unshift('"Sensei" is the user you are talking to.');
  }

  const style = profile.speakingStyle ?? {};
  const jp = style.japanese ?? {};
  const speaking = [
    ...(style.tone?.length ? ['Tone:', ...bullets(style.tone)] : []),
    ...(style.patterns?.length ? ['Patterns:', ...bullets(style.patterns)] : []),
    ...(Object.keys(jp).length
      ? [
          'Japanese:',
          ...(jp.firstPerson ? [`- First person: ${jp.firstPerson}`] : []),
          ...(jp.addressUser ? [`- Address the user as: ${jp.addressUser}`] : []),
          ...(jp.register ? [`- Register: ${jp.register}`] : []),
        ]
      : []),
  ];

  const dialogues = (profile.sampleDialogues ?? []).map((d: Dict) => `- (${d.context}) ${d.line}`);

  const rules = profile.rules ?? {};
  const ruleLines = [
    ...(rules.do?.length ? ['Do:', ...bullets(rules.do)] : []),
    ...(rules.dont?.length ? ["Don't:", ...bullets(rules.dont)] : []),
  ];

  return [
    section('Identity', identity),
    section('Personality', personality),
    section('Relationships', relationships),
    section('Background', bullets(profile.background)),
    section('World', bullets(profile.world)),
    section('Speaking style', speaking),
    section('Sample dialogues', dialogues),
    section('Rules', ruleLines),
  ]
    .filter(Boolean)
    .join('\n\n');
}

const optionalString = (value: unknown) => value === undefined || value === null || typeof value === 'string';
const LIST_FIELDS = ['relationships', 'background', 'world', 'sampleDialogues'];

/** Reads, validates and renders one file; every error names the file. */
function loadCharacterFile(dir: string, file: string) {
  try {
    const data: Dict = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    if (typeof data?.slug !== 'string' || !data.slug || typeof data.name !== 'string' || !data.name) {
      throw new Error('slug and name must be non-empty strings');
    }
    if (!data.profile || typeof data.profile !== 'object' || Array.isArray(data.profile)) {
      throw new Error('profile must be an object');
    }
    if (![data.source, data.voiceId, data.memoryRule].every(optionalString)) {
      throw new Error('source, voiceId and memoryRule must be strings or null');
    }
    const badList = LIST_FIELDS.find((key) => data.profile[key] !== undefined && !Array.isArray(data.profile[key]));
    if (badList) throw new Error(`profile.${badList} must be an array`);

    return {
      slug: data.slug as string,
      name: data.name as string,
      source: data.source ?? null,
      voiceId: data.voiceId ?? null,
      memoryRule: data.memoryRule ?? null,
      systemPrompt: renderCharacterPrompt(data.profile),
    };
  } catch (error) {
    throw new Error(`Invalid character file ${file}: ${(error as Error).message}`);
  }
}

/** Upserts every *.json in `dir` by slug in one transaction; returns the upserted slugs. */
export async function seedCharacters(prisma: PrismaClient, dir: string = DEFAULT_DIR): Promise<string[]> {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort();

  // Validate everything first so a broken file writes nothing
  const characters = files.map((file) => loadCharacterFile(dir, file));
  const seen = new Map<string, string>();
  characters.forEach(({ slug }, i) => {
    if (seen.has(slug)) {
      throw new Error(`Duplicate character slug "${slug}" in ${seen.get(slug)} and ${files[i]}`);
    }
    seen.set(slug, files[i]);
  });

  await prisma.$transaction(
    characters.map(({ slug, ...fields }) =>
      prisma.character.upsert({ where: { slug }, update: fields, create: { slug, ...fields } }),
    ),
  );
  characters.forEach(({ slug }) => console.log(`Character ready: ${slug}`));
  return characters.map(({ slug }) => slug);
}
