import PatreonConnectClient from "./PatreonConnectClient";
import { resolvePatreonOAuthClientId } from "@/lib/resolve-patreon-oauth-client-id";

export default function PatreonConnectPage() {
  const initialClientId = resolvePatreonOAuthClientId();
  return <PatreonConnectClient initialClientId={initialClientId} />;
}
