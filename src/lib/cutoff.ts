/**
 * The answer did not fit in the output budget.
 *
 * Its own type because the callers that hit it — extraction on a dense
 * reference page, exam generation on a 100-check brain — both recover by
 * asking for less, and neither should match on message text to know that.
 *
 * Its own file because both wire paths throw it, and openai-compat.ts is
 * deliberately free of the env validation claude.ts runs at import time.
 */
export class OutputCutoff extends Error {}
