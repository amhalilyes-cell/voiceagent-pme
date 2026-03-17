import { NextResponse } from "next/server";
import { readArtisans } from "@/lib/storage";

const VAPI_BASE_URL = "https://api.vapi.ai";

async function fetchRecentCalls() {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch(`${VAPI_BASE_URL}/call?limit=20`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.results ?? []);
  } catch {
    return [];
  }
}

export async function GET() {
  const [calls, artisans] = await Promise.all([
    fetchRecentCalls(),
    readArtisans(),
  ]);

  return NextResponse.json({
    artisans: artisans.length,
    activeArtisans: artisans.filter((a) => a.status === "active").length,
    calls,
    totalCalls: calls.length,
  });
}
