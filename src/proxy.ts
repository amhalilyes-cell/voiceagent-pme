import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    if (!token) return; // withAuth redirige déjà vers /login

    const now = Date.now();
    const trialEndsAt = token.trialEndsAt
      ? new Date(token.trialEndsAt as string).getTime()
      : 0;

    const isActive = token.status === "active";
    const isInTrial = trialEndsAt > now;

    if (!isActive && !isInTrial) {
      return NextResponse.redirect(new URL("/abonnement-expire", req.url));
    }
  },
  { pages: { signIn: "/login" } }
);

export const config = {
  matcher: ["/dashboard/:path*", "/dashboard"],
};
