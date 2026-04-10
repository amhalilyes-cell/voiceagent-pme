import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findArtisanById, updateArtisan } from "@/lib/storage";
import type { TypeEtablissement } from "@/types/artisan";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const artisan = await findArtisanById(session.user.id);
    if (!artisan) return NextResponse.json({ error: "Artisan introuvable" }, { status: 404 });
    return NextResponse.json(artisan);
  } catch (err) {
    console.error("[api/artisan/me GET]", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let body: Partial<{
    nomEntreprise: string;
    telephone: string;
    typeEtablissement: TypeEtablissement;
    permisProposes: string[];
    tarifHeureConduite: number;
    forfaits: string;
    financementCpf: boolean;
    conduiteAccompagnee: boolean;
    permisAccelere: boolean;
    horairesOuverture: string;
    adresseEtablissement: string;
  }>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  try {
    const updated = await updateArtisan(session.user.id, body);
    if (!updated) return NextResponse.json({ error: "Artisan introuvable" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[api/artisan/me PATCH]", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
