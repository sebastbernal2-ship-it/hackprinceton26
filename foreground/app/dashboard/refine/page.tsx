import type { Metadata } from "next";
import Refine from "../../components/refine";

export const metadata: Metadata = {
  title: "Chat & Refine · Foreground",
};

export default function RefinePage() {
  return <Refine />;
}
