import { NextRequest, NextResponse } from "next/server";
import { findArtisanByResetToken, updateArtisan, clearResetToken } from "@/lib/storage";
import { hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const { token, password } = body;
  if (!token || !password) {
    return NextResponse.json({ error: "Token et mot de passe requis" }, { status: 422 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Le mot de passe doit contenir au moins 8 caractères" }, { status: 422 });
  }

  try {
    const artisan = await findArtisanByResetToken(token);
    if (!artisan) {
      return NextResponse.json({ error: "Lien invalide ou déjà utilisé" }, { status: 400 });
    }

    if (!artisan.resetTokenExpires || new Date(artisan.resetTokenExpires) < new Date()) {
      return NextResponse.json({ error: "Lien expiré — demandez un nouveau lien" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);

    await updateArtisan(artisan.id, { passwordHash });
    await clearResetToken(artisan.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/auth/new-password]", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
