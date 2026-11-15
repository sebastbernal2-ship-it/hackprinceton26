import { redirect } from "next/navigation";

// The upload moved into the Profile area; this keeps the old link working.
export default function ReferenceMediaPage() {
  redirect("/dashboard/profile#reference-media");
}
