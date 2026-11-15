// Dev-only demo of the Fio inspector character: a floor, the character, and canned actions (design my place, look around).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import type { Asset } from "../../lib/assets";
import { FioDemo } from "./fio-demo";

export default function FioDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const root = path.resolve(process.cwd(), "..");
  const lib = path.join(root, "assets/library");
  const assets = readdirSync(lib).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(path.join(lib, f), "utf8")) as Asset);
  const catalog = JSON.parse(readFileSync(path.join(root, "data/financial/catalog.json"), "utf8")) as {
    equipment: { id: string; listPrice: number }[];
    reskinEquipment: { id: string; listPrice: number }[];
  };
  const prices = Object.fromEntries([...catalog.equipment, ...catalog.reskinEquipment].map((e) => [e.id, e.listPrice]));
  return <FioDemo assets={assets} prices={prices} />;
}
