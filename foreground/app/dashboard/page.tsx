import type { Metadata } from "next";
import Discover from "../components/discover";
import AgentPanel from "../components/agent/agent-panel";

export const metadata: Metadata = {
  title: "Discover · Foreground",
};

export default function DiscoverPage() {
  return (
    <>
      <Discover />
      <AgentPanel />
    </>
  );
}
