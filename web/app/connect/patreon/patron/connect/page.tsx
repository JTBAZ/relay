import { PatronConnectClient } from "./PatronConnectClient";
import { resolvePatreonOAuthClientId } from "@/lib/resolve-patreon-oauth-client-id";

export default function PatreonPatronConnectPage() {
  return <PatronConnectClient initialClientId={resolvePatreonOAuthClientId()} />;
}
