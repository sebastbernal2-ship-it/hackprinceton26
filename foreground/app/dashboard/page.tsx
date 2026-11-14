import type { Metadata } from "next";
import Discover from "../components/discover";

export const metadata: Metadata = {
  title: "Discover · Foreground",
};

export default function DiscoverPage() {
  return <Discover />;
}
