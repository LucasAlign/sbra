import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Google verifies the provider subject; server-side network actions resolve it
// to a durable person. Sessions contain no community or business permissions.
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        // Use the authenticated provider subject, not email or a roster record.
        token.sub = account.provider === "google" ? `google:${account.providerAccountId}` : undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.sub ?? "";
      return session;
    }
  }
});
