import { prisma } from "@/server/db";
import { errors } from "@/server/http";
import type { SessionContext } from "@/server/session";

/**
 * The shop's own answer book.
 *
 * Deliberately small for the first version: a question, an answer, optional tags,
 * and a text search (`ILIKE` on tokens with a simple overlap score). No embeddings,
 * no vector store — a shop with forty entries does not need one, and a plain table
 * is reviewable by the person who owns the words.
 *
 * The search never invents: it returns entries that actually matched, and the reply
 * composer shows them as suggestions the seller must approve.
 */

export type KnowledgeInput = { question: string; answer: string; tags?: string[] };

export type KnowledgeEntryView = {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  score?: number;
};

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function createKnowledge(ctx: SessionContext, input: KnowledgeInput): Promise<KnowledgeEntryView> {
  const question = normalize(input.question);
  const answer = input.answer.trim();
  if (question.length < 3) throw errors.invalid("پرسش باید حداقل ۳ نویسه باشد.");
  if (answer.length < 2) throw errors.invalid("پاسخ خالی است.");
  if (question.length > 300 || answer.length > 4000) throw errors.invalid("متن بیش از حد بلند است.");

  const tags = (input.tags ?? []).map((tag) => normalize(tag)).filter((tag) => tag.length > 0).slice(0, 10);

  const entry = await prisma.knowledgeEntry.create({
    data: { tenantId: ctx.tenant.id, question, answer, tags },
    select: { id: true, question: true, answer: true, tags: true },
  });
  return entry;
}

export async function listKnowledge(ctx: SessionContext): Promise<KnowledgeEntryView[]> {
  return prisma.knowledgeEntry.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, question: true, answer: true, tags: true },
  });
}

export async function deleteKnowledge(ctx: SessionContext, id: string): Promise<void> {
  const row = await prisma.knowledgeEntry.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  if (!row) throw errors.notFound("این پاسخ در پایگاه دانش پیدا نشد.");
  await prisma.knowledgeEntry.delete({ where: { id: row.id } });
}

/**
 * Ranking: an entry scores by how many query tokens it contains (question weighted
 * twice), so "شال موجوده؟" prefers "موجودی شال" over an entry that shares one word.
 */
export function scoreEntry(entry: { question: string; answer: string; tags: string[] }, queryTokens: readonly string[]): number {
  const question = entry.question.toLowerCase();
  const answer = entry.answer.toLowerCase();
  const tags = entry.tags.join(" ").toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (token.length < 2) continue;
    if (question.includes(token)) score += 3;
    if (tags.includes(token)) score += 2;
    if (answer.includes(token)) score += 1;
  }
  return score;
}

export function tokenize(query: string): string[] {
  return normalize(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
}

export async function searchKnowledge(
  ctx: SessionContext,
  query: string,
  limit = 3,
): Promise<KnowledgeEntryView[]> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const rows = await prisma.knowledgeEntry.findMany({
    where: {
      tenantId: ctx.tenant.id,
      OR: tokens.flatMap((token) => [
        { question: { contains: token, mode: "insensitive" as const } },
        { answer: { contains: token, mode: "insensitive" as const } },
        { tags: { has: token } },
      ]),
    },
    take: 50,
    select: { id: true, question: true, answer: true, tags: true },
  });

  return rows
    .map((row) => ({ ...row, score: scoreEntry(row, tokens) }))
    .filter((row) => (row.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, Math.max(1, Math.min(limit, 10)));
}

/** The composer's "answers we already have" list for the message being read. */
export async function suggestReplies(
  ctx: SessionContext,
  conversationId: string,
): Promise<{ suggestions: KnowledgeEntryView[]; window: { canReply: boolean; expiresAt: string | null } }> {
  const lastInbound = await prisma.message.findFirst({
    where: { conversationId, tenantId: ctx.tenant.id, direction: "inbound" },
    orderBy: { occurredAt: "desc" },
    select: { text: true, occurredAt: true },
  });
  const suggestions = lastInbound?.text ? await searchKnowledge(ctx, lastInbound.text, 3) : [];
  const expiresAt = lastInbound ? new Date(lastInbound.occurredAt.getTime() + 24 * 60 * 60 * 1000) : null;
  return {
    suggestions,
    window: { canReply: Boolean(expiresAt && expiresAt.getTime() > Date.now()), expiresAt: expiresAt?.toISOString() ?? null },
  };
}
