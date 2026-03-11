import fs from "fs";
import path from "path";
import type { Artisan } from "@/types/artisan";

const DATA_FILE = path.join(process.cwd(), "data", "artisans.json");

export function readArtisans(): Artisan[] {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw) as Artisan[];
  } catch {
    return [];
  }
}

export function writeArtisans(artisans: Artisan[]): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(artisans, null, 2), "utf-8");
}

export function saveArtisan(artisan: Artisan): void {
  const artisans = readArtisans();
  const idx = artisans.findIndex((a) => a.id === artisan.id);
  if (idx >= 0) {
    artisans[idx] = artisan;
  } else {
    artisans.push(artisan);
  }
  writeArtisans(artisans);
}

export function findArtisanByEmail(email: string): Artisan | undefined {
  return readArtisans().find((a) => a.email === email);
}

export function findArtisanById(id: string): Artisan | undefined {
  return readArtisans().find((a) => a.id === id);
}

export function updateArtisan(
  id: string,
  patch: Partial<Artisan>
): Artisan | null {
  const artisans = readArtisans();
  const idx = artisans.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  artisans[idx] = { ...artisans[idx], ...patch };
  writeArtisans(artisans);
  return artisans[idx];
}
