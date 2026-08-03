import { betterAuth } from "better-auth";
// Relative, not "@/..." — the better-auth CLI loads this file outside the
// Next.js resolver and does not honour tsconfig path aliases.
import { pool } from "../db";
import { env } from "./env";

/**
 * Identity. better-auth owns the "user"/"session"/"account"/"verification"
 * tables; app tables FK into "user"(id). Run `npm run auth:migrate` before
 * `npm run db:migrate` on a fresh database.
 */
export const auth = betterAuth({
  database: pool,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  socialProviders:
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
          },
        }
      : undefined,

  // Email+password stays on so the app is usable before GitHub OAuth is set up.
  emailAndPassword: { enabled: true },

  user: {
    additionalFields: {
      plan: { type: "string", defaultValue: "free", input: false },
      handle: { type: "string", required: false, input: false },
    },
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Public namespace for brains: /b/{handle}/{slug}. Derive from the
          // email local part, then disambiguate — the unique index is the
          // real guard, this loop just avoids burning attempts.
          const base =
            (user.email ?? "user")
              .split("@")[0]
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")
              .slice(0, 30) || "user";

          for (let i = 0; i < 20; i++) {
            const candidate = i === 0 ? base : `${base}-${i}`;
            const res = await pool.query(
              `update "user" set handle = $1
                 where id = $2
                   and not exists (select 1 from "user" where handle = $1)`,
              [candidate, user.id],
            );
            if (res.rowCount) return;
          }
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
