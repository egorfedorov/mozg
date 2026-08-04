import { oAuthProtectedResourceMetadata } from "better-auth/plugins";
import { auth } from "@/lib/auth";

// Named in our 401's WWW-Authenticate so MCP clients know where to auth.
export const GET = oAuthProtectedResourceMetadata(auth);
