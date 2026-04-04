import { DefaultSession } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      status?: string;
      trialEndsAt?: string;
    };
  }
  interface User {
    id: string;
    status?: string;
    trialEndsAt?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    status?: string;
    trialEndsAt?: string;
  }
}
