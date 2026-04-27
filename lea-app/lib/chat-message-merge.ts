import type { ChatMessage } from '@/components/pentest/chat-messages';

const MAX_DISPLAY_MESSAGES = 400;
const DEDUPE_TEXT_MIN_CHARS = 16;

function getMessageContent(message: ChatMessage): string | null {
  if ('content' in message) {
    const content = message.content.replace(/\s+/g, ' ').trim();
    return content.length > 0 ? content : null;
  }
  return null;
}

function getContentKey(message: ChatMessage): string | null {
  const content = getMessageContent(message);
  if (!content || content.length < DEDUPE_TEXT_MIN_CHARS) return null;
  return `${message.type}:${content.slice(0, 2_000)}`;
}

function preferRicherMessage(current: ChatMessage, next: ChatMessage): ChatMessage {
  const currentContent = getMessageContent(current);
  const nextContent = getMessageContent(next);
  const keepCurrentTimestamp = Math.min(current.ts, next.ts);

  if (nextContent && (!currentContent || nextContent.length >= currentContent.length)) {
    return { ...current, ...next, ts: keepCurrentTimestamp } as ChatMessage;
  }

  return { ...next, ...current, ts: keepCurrentTimestamp } as ChatMessage;
}

export function mergeChatMessagesForDisplay(...messageGroups: ChatMessage[][]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  const contentKeyToId = new Map<string, string>();

  for (const message of messageGroups.flat()) {
    const existingById = byId.get(message.id);
    if (existingById) {
      byId.set(message.id, preferRicherMessage(existingById, message));
      continue;
    }

    const contentKey = getContentKey(message);
    const existingContentId = contentKey ? contentKeyToId.get(contentKey) : undefined;
    const existingByContent = existingContentId ? byId.get(existingContentId) : undefined;

    if (existingContentId && existingByContent) {
      byId.set(existingContentId, preferRicherMessage(existingByContent, message));
      continue;
    }

    byId.set(message.id, message);
    if (contentKey) {
      contentKeyToId.set(contentKey, message.id);
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => a.ts - b.ts)
    .slice(-MAX_DISPLAY_MESSAGES);
}
