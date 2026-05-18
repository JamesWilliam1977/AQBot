import type { Message } from '@/types';

const ASSISTANT_BUBBLE_KEY_PREFIX = 'ai:';

export function normalizeAssistantBubbleParentKey(key: unknown): string {
  const rawKey = String(key ?? '');
  return rawKey.startsWith(ASSISTANT_BUBBLE_KEY_PREFIX)
    ? rawKey.slice(ASSISTANT_BUBBLE_KEY_PREFIX.length)
    : rawKey;
}

export function resolveAssistantMessageForBubbleKey(
  key: unknown,
  assistantByParentId: Map<string, Message>,
  messageById: Map<string, Message>,
): Message | undefined {
  const rawKey = String(key ?? '');
  const parentKey = normalizeAssistantBubbleParentKey(rawKey);
  return assistantByParentId.get(parentKey)
    ?? assistantByParentId.get(rawKey)
    ?? messageById.get(rawKey)
    ?? messageById.get(parentKey);
}
