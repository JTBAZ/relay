import SubscribeStarCreatorConnectClient from "./SubscribeStarCreatorConnectClient";
import { resolveSubscribeStarCreatorOAuthClientId } from "@/lib/resolve-subscribestar-oauth-client-id";

export default function SubscribeStarCreatorConnectPage() {
  const initialClientId = resolveSubscribeStarCreatorOAuthClientId();
  return <SubscribeStarCreatorConnectClient initialClientId={initialClientId} />;
}
