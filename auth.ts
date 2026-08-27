import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Auth.js (NextAuth v5). Google sign-in with JWT sessions — no DB required to
// run, activates when AUTH_SECRET + AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET are set
// (e.g. on Replit). A Drizzle adapter can be added later for DB-backed sessions.
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" }
});
