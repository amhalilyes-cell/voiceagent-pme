import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

const REDIRECT_URI = "https://voiceagent-pme.vercel.app/api/auth/google/callback";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXTAUTH_URL ?? "https://voiceagent-pme.vercel.app";
  const failUrl = `${appUrl}/dashboard/parametres?calendar=error`;
  const successUrl = `${appUrl}/dashboard/parametres?calendar=success`;

  if (error || !code || !state) {
    console.error("[Google OAuth] Erreur ou paramètres manquants:", error);
    return NextResponse.redirect(failUrl);
  }

  // Décode l'email depuis le state
  let email: string;
  try {
    email = Buffer.from(state, "base64url").toString("utf-8");
    if (!email.includes("@")) throw new Error("Email invalide");
  } catch {
    console.error("[Google OAuth] State invalide:", state);
    return NextResponse.redirect(failUrl);
  }

  // Échange le code contre les tokens
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("[Google OAuth] Variables GOOGLE_CLIENT_ID/SECRET manquantes");
    return NextResponse.redirect(failUrl);
  }

  let refreshToken: string;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      throw new Error(`Token exchange failed: ${body}`);
    }

    const tokens = await tokenRes.json();
    if (!tokens.refresh_token) {
      throw new Error("Pas de refresh_token dans la réponse Google");
    }
    refreshToken = tokens.refresh_token;
  } catch (err) {
    console.error("[Google OAuth] Échange de token échoué:", err);
    return NextResponse.redirect(failUrl);
  }

  // Sauvegarde le refresh_token dans Supabase
  try {
    const { error: dbError } = await getSupabase()
      .from("artisans")
      .update({ refresh_token: refreshToken })
      .eq("email", email);

    if (dbError) throw new Error(dbError.message);
    console.log(`[Google OAuth] refresh_token sauvegardé pour ${email}`);
  } catch (err) {
    console.error("[Google OAuth] Sauvegarde Supabase échouée:", err);
    return NextResponse.redirect(failUrl);
  }

  return NextResponse.redirect(successUrl);
}
