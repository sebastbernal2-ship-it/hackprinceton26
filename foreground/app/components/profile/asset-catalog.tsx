"use client";

import { useEffect, useState } from "react";
import { listAssets, orderAssets, type Asset, type AssetCategory } from "../../lib/assets";
import AssetBrowser from "../asset-browser";

/** The catalog for one profile: its own assets first, then the shared library. Browse only; nothing is placed here. */
export default function AssetCatalog({ profileId, reload }: { profileId: string; reload: number }) {
  const [category, setCategory] = useState<AssetCategory | "">("");
  const [local, setLocal] = useState(0);
  const [catalog, setCatalog] = useState<{ status: "loading" | "ok" | "error"; assets: Asset[]; error: string }>({ status: "loading", assets: [], error: "" });

  useEffect(() => {
    let live = true;
    listAssets({ profileId, category })
      .then((assets) => live && setCatalog({ status: "ok", assets: orderAssets(assets, profileId), error: "" }))
      .catch((e: unknown) => live && setCatalog({ status: "error", assets: [], error: e instanceof Error ? e.message : "failed" }));
    return () => { live = false; };
  }, [profileId, category, reload, local]);

  return (
    <AssetBrowser
      assets={catalog.assets} profileId={profileId} status={catalog.status} error={catalog.error}
      category={category} onCategory={setCategory} lines={[]}
      onSaved={() => setLocal((n) => n + 1)}
    />
  );
}
