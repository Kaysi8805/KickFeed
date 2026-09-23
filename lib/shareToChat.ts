import type { SharedPostPayload } from '@/data/types';
import { buildPostShareMessage, snippetPostText } from '@/lib/sharePost';
import { isPersistedUserId } from '@/lib/userIdentity';

const ID_MAX = 80;
const NAME_MAX = 80;
const HANDLE_MAX = 32;
const SNIPPET_MAX = 200;
const LABEL_MAX = 80;

function clean(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

/** Drop junk and any link field. A post route does not exist, so shares never carry a URL. */
export function parseSharedPost(value: unknown): SharedPostPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if ('url' in row || 'href' in row || 'link' in row) return null;
  const postId = clean(row.postId, ID_MAX);
  const authorId = typeof row.authorId === 'string' ? row.authorId.trim() : '';
  const authorName = clean(row.authorName, NAME_MAX);
  const authorHandle = clean(typeof row.authorHandle === 'string' ? row.authorHandle.replace(/^@/, '') : '', HANDLE_MAX);
  const snippet = clean(row.snippet, SNIPPET_MAX);
  if (!postId || !isPersistedUserId(authorId) || !authorName || !authorHandle || !snippet) return null;
  const matchLabel = clean(row.matchLabel, LABEL_MAX);
  const matchId = clean(row.matchId, ID_MAX);
  return {
    postId,
    authorId,
    authorName,
    authorHandle,
    snippet,
    ...(matchLabel ? { matchLabel } : {}),
    ...(matchId ? { matchId } : {}),
  };
}

/** Rich card for Send in KickFeed. Snippet only — never invents a link. */
export function buildSharedPostPayload(input: {
  postId: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  text: string;
  matchLabel?: string;
  matchId?: string;
}): SharedPostPayload | null {
  return parseSharedPost({
    postId: input.postId,
    authorId: input.authorId,
    authorName: input.authorName,
    authorHandle: input.authorHandle,
    snippet: snippetPostText(input.text),
    matchLabel: input.matchLabel,
    matchId: input.matchId,
  });
}

/** Plain body stored next to the card so inbox previews and older clients still read. */
export function sharedPostBody(payload: SharedPostPayload): string {
  return buildPostShareMessage({
    authorName: payload.authorName,
    authorHandle: payload.authorHandle,
    text: payload.snippet,
    matchLabel: payload.matchLabel,
  });
}

export function chatPreview(text: string, share?: SharedPostPayload | null): string {
  if (share?.authorName) return `Shared ${share.authorName}'s post`;
  return text;
}
