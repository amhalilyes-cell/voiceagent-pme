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
            .select("id, email, prenom, nom, password_hash, status")
            .eq("email", credentials.email)
            .maybeSingle();

          if (!data?.password_hash) return null;

          const valid = await bcrypt.compare(credentials.password, data.password_hash);
          if (!valid) return null;

          return {
            id: data.id,
            email: data.email,
            name: `${data.prenom} ${data.nom}`,
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
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.id;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
