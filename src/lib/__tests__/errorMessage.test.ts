import { describe, expect, it } from 'vitest';
import { getErrorMessage, isFormValidationError } from '../errorMessage';

describe('errorMessage', () => {
  it('extracts readable messages from structured errors', () => {
    expect(getErrorMessage({ message: 'Invalid access key' })).toBe(
      'Invalid access key',
    );
    expect(getErrorMessage({ error: 'Access denied' })).toBe('Access denied');
    expect(getErrorMessage({ detail: 'Bucket not found' })).toBe(
      'Bucket not found',
    );
  });

  it('detects Ant Design form validation rejections', () => {
    expect(
      isFormValidationError({
        values: {},
        errorFields: [{ name: ['bucket'], errors: ['Bucket is required'] }],
      }),
    ).toBe(true);
    expect(isFormValidationError({ message: 'network failed' })).toBe(false);
  });
});
