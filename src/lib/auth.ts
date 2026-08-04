import { betterAuth } from "better-auth";
// Relative, not "@/..." — the better-auth CLI loads this file outside the
// Next.js resolver and does not honour tsconfig path aliases.
import { pool } from "../db";
import { env, emailReady } from "./env";
import { sendMail } from "./mail";

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

  // Sign-in stays on so anyone who already has a password keeps working.
  //
  // Sign-up is closed until mail can be sent, because without it a password
  // account is a dead end: its address is never verified, so brains shared
  // with it by email silently grant nothing, and a forgotten password can
  // never be reset. GitHub OAuth verifies the address as a side effect, which
  // is why it stays open. Adding RESEND_API_KEY + EMAIL_FROM to .env turns
  // sign-up and both mails on with no code change.
  emailAndPassword: {
    enabled: true,
    disableSignUp: !emailReady,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Reset your mozg password",
        text:
          `Someone — hopefully you — asked to reset the password for ${user.email}.\n\n` +
          `Reset it here:\n${url}\n\n` +
          "If this was not you, ignore this mail; the link expires on its own.",
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Confirm your mozg address",
        text:
          "One click and your account is live — brains shared with this " +
          "address start working the moment it is confirmed:\n\n" +
          `${url}\n\n` +
          "If you did not sign up at mozg.sh, ignore this mail.",
      });
    },
  },

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
