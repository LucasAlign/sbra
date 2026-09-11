import { SBRAApp } from "@/components/sbra-app";
import { NetworkWorkspace } from "@/components/network-workspace";
import { isBackendEnabled } from "@/lib/backend";
import { localDemoEnabled } from "@/lib/local-demo";

export default function Home() {
  return isBackendEnabled() ? <NetworkWorkspace localDemo={localDemoEnabled()} /> : <SBRAApp />;
}
