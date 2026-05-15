export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    for (const key of ['message', 'error', 'detail', 'reason']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') {
        return serialized;
      }
    } catch {
      // Fall through to the generic conversion.
    }
  }

  return String(error);
}

export function isFormValidationError(error: unknown): boolean {
  return !!(
    error &&
    typeof error === 'object' &&
    Array.isArray((error as { errorFields?: unknown }).errorFields)
  );
}
