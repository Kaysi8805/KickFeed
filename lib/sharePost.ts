const SNIPPET_MAX = 180;

export type PostShareParts = {
  authorName: string;
  authorHandle: string;
  text: string;
  /** Optional score / vs label, e.g. "LIV 1–1 ARS". */
  matchLabel?: string;
  /**
   * Only pass a real shareable https (or known public) link.
   * Do not invent kickfeed:// or landing URLs that do not open the post.
   */
  url?: string;
};

/** Trim post body for the OS share sheet without cutting mid-word when possible. */
export function snippetPostText(text: string, max = SNIPPET_MAX): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const base = lastSpace > max * 0.5 ? slice.slice(0, lastSpace) : slice;
  return `${base.trimEnd()}…`;
}

/** Pure message for Share.share — author, snippet, optional match context / link. */
export function buildPostShareMessage(parts: PostShareParts): string {
  const handle = parts.authorHandle.replace(/^@/, '');
  const snippet = snippetPostText(parts.text);
  const lines = [`${parts.authorName} (@${handle}) on KickFeed:`, snippet];
  if (parts.matchLabel?.trim()) {
    lines.push(`Match: ${parts.matchLabel.trim()}`);
  }
  const url = parts.url?.trim();
  if (url) lines.push(url);
  return lines.join('\n');
}
