"use client";
import { useState } from "react";
import type { Asset } from "../lib/assets";
import AssetIcon from "./asset-icon";

/** Rendered 3D preview from GET /api/assets/{id}/thumb; the flat AssetIcon shows until it loads or when none exists. */
export default function AssetThumb({ asset, size = 44, className = "" }: { asset: Pick<Asset, "assetId" | "name" | "category">; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <AssetIcon asset={asset} size={size} className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/assets/${encodeURIComponent(asset.assetId)}/thumb`} alt="" width={size} height={size} draggable={false} loading="lazy"
      onError={() => setFailed(true)} style={{ width: size, height: size }} className={`rounded border border-foreground/15 object-cover ${className}`} />
  );
}
