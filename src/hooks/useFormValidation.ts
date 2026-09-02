// src/hooks/useFormValidation.ts
// Reactive form-validity gate built on the Zod schemas in src/lib/validation.ts —
// so a CTA's `disabled` prop always reflects the live field values, never a
// stale snapshot. Pass live state in; nothing here holds its own copy.

import { z, type ZodType } from "zod";

type FieldErrors = Record<string, string>;

export function useFormValidation<T>(schema: ZodType<T>, values: T): { isValid: boolean; errors: FieldErrors } {
  const result = schema.safeParse(values);
  if (result.success) return { isValid: true, errors: {} };

  const { fieldErrors } = z.flattenError(result.error);
  const errors: FieldErrors = {};
  for (const key of Object.keys(fieldErrors)) {
    const message = (fieldErrors as Record<string, string[] | undefined>)[key]?.[0];
    if (message) errors[key] = message;
  }
  return { isValid: false, errors };
}
