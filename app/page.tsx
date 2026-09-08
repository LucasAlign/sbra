import { SBRAApp } from "@/components/sbra-app";
import { NetworkWorkspace } from "@/components/network-workspace";
import { isBackendEnabled } from "@/lib/backend";

export default function Home() {
  return isBackendEnabled() ? <NetworkWorkspace /> : <SBRAApp />;
}
