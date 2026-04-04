import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getSupabase } from "@/lib/supabase";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const { data } = await getSupabase()
            .from("artisans")
            .select("id, email, prenom, nom, password_hash, status, trial_ends_at")
            .eq("email", credentials.email)
            .maybeSingle();

          if (!data?.password_hash) return null;

          const valid = await bcrypt.compare(credentials.password, data.password_hash);
          if (!valid) return null;

          return {
            id: data.id,
            email: data.email,
            name: `${data.prenom} ${data.nom}`,
            // Pass through for JWT
            status: data.status,
            trialEndsAt: data.trial_ends_at ?? undefined,
          };
        } catch (err) {
          console.error("[Auth] Erreur autorisation:", err);
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.status = (user as { status?: string }).status;
        token.trialEndsAt = (user as { trialEndsAt?: string }).trialEndsAt;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.status = token.status as string | undefined;
        session.user.trialEndsAt = token.trialEndsAt as string | undefined;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
