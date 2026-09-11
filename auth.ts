import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { localDemoEnabled } from "@/lib/local-demo";

// Google verifies the provider subject; server-side network actions resolve it
// to a durable person. Sessions contain no community or business permissions.
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google, ...(localDemoEnabled() ? [Credentials({
    credentials: { role: {}, password: { type: "password" } },
    authorize(credentials) {
      if (!localDemoEnabled() || credentials.password !== process.env.COLLAB_DEMO_PASSWORD || !["admin", "member"].includes(String(credentials.role))) return null;
      return { id: `demo:${credentials.role}`, name: credentials.role === "admin" ? "Demo Admin" : "Demo Member" };
    },
  })] : [])],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, user }) {
      if (account) {
        // Use the authenticated provider subject, not email or a roster record.
        token.sub = account.provider === "google" ? `google:${account.providerAccountId}` :
          account.provider === "credentials" && localDemoEnabled() ? user.id : undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.sub ?? "";
      return session;
    }
  }
});
