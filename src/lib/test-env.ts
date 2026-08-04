/**
 * Import this FIRST in any test whose module chain reaches @/lib/env — env
 * validates at import time, and esbuild hoists imports above statements, so
 * an inline stub runs too late. Import order among imports is preserved,
 * which makes a stub-module the one reliable place for this.
 */
process.env.DATABASE_URL ??= "postgres://localhost:5432/mozg-test";

export {};
