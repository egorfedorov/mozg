import { oAuthDiscoveryMetadata } from "better-auth/plugins";
import { auth } from "@/lib/auth";

// OAuth clients (ChatGPT connectors among them) start here.
export const GET = oAuthDiscoveryMetadata(auth);
