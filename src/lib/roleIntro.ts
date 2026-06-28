import type { Role } from '@/types';

export interface RoleIntro {
  openingMessage: string | null;
  openingQuestions: string[];
}

export const ROLE_INTRO_KEY = (conversationId: string) => `aqbot_role_intro_${conversationId}`;

export function saveRoleIntro(conversationId: string, role: Pick<Role, 'opening_message' | 'opening_questions'>) {
  const intro: RoleIntro = {
    openingMessage: role.opening_message ?? null,
    openingQuestions: role.opening_questions,
  };
  if (!intro.openingMessage && intro.openingQuestions.length === 0) {
    localStorage.removeItem(ROLE_INTRO_KEY(conversationId));
    return;
  }
  localStorage.setItem(ROLE_INTRO_KEY(conversationId), JSON.stringify(intro));
}

export function getRoleIntro(conversationId: string): RoleIntro | null {
  try {
    const raw = localStorage.getItem(ROLE_INTRO_KEY(conversationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RoleIntro>;
    const openingQuestions = Array.isArray(parsed.openingQuestions)
      ? parsed.openingQuestions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    const openingMessage = typeof parsed.openingMessage === 'string' && parsed.openingMessage.trim()
      ? parsed.openingMessage
      : null;
    return openingMessage || openingQuestions.length > 0 ? { openingMessage, openingQuestions } : null;
  } catch {
    return null;
  }
}
