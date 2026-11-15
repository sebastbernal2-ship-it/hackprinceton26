"use client";

import { useRef, useState } from "react";
import { AssetApiError, CATEGORIES, createAsset, editDims, HEX_COLOR, ingestImages, isVideoFile, MAX_ASSET_UPLOAD_BYTES, MAX_ASSET_UPLOAD_IMAGES, MAX_ASSET_UPLOAD_VIDEO_BYTES, splitList, type Asset, type AssetCategory, type AssetStyle, type IngestResponse } from "../lib/assets";
import { AssetFacts, DraftBadge, FootprintSvg } from "./asset-bits";

type Props = { profileId: string | null; onClose: () => void; onConfirmed: (asset: Asset) => void };

export default function AssetUpload({ profileId, onClose, onConfirmed }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [scale, setScale] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [drafts, setDrafts] = useState<Asset[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const dialog = useRef<HTMLDivElement>(null);

  async function upload() {
    setBusy(true);
    setError("");
    try {
      const out = await ingestImages(files, { profileId, referenceScale: scale.trim() });
      setResult(out);
      setDrafts(out.proposals);
    } catch (e) {
      setError(e instanceof AssetApiError ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  const emptyStyle: AssetStyle = { materials: [], colors: [], finish: null, styleTags: [], inferred: true };
  const editStyle = (id: string, patch: Partial<AssetStyle>) => edit(id, (a) => ({ ...a, style: { ...emptyStyle, ...a.style, ...patch } }));
  const badColors = (a: Asset) => (a.style?.colors ?? []).filter((c) => !HEX_COLOR.test(c));

  function edit(id: string, patch: (a: Asset) => Asset) {
    setDrafts((list) => list.map((a) => (a.assetId === id ? patch(a) : a)));
  }

  async function confirm(draft: Asset) {
    setError("");
    try {
      // Editing dims by hand does not make them measured: the status stays whatever the service said unless the person changes it.
      const asset = await createAsset({ ...draft, status: "confirmed", profileId: profileId ?? draft.profileId });
      setSaved((s) => [...s, draft.assetId]);
      onConfirmed(asset);
    } catch (e) {
      setError(e instanceof AssetApiError ? e.message : "Could not save the asset.");
    }
  }

  return (
    <div ref={dialog} role="dialog" aria-modal="true" aria-label="Upload equipment photos" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/40 p-4" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <div className="mt-8 w-full max-w-2xl rounded-xl bg-background p-5 text-sm shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-medium">Add equipment from photos or video</h3>
          <button type="button" onClick={onClose} className="text-foreground/60 underline">Close</button>
        </div>
        <p className="mt-1 text-foreground/65">Photos or one short video are sent to the asset service (video: a few sharp frames are sampled), which proposes catalog entries. Proposals are drafts until you confirm them{profileId ? ", and confirmed ones are saved to this profile" : ". With no profile set they are saved to no profile"}.</p>
        <div className="mt-3 space-y-2">
          <label className="block">Photos or video <input aria-label="Photos or video" type="file" accept=".jpg,.jpeg,.png,.webp,.mp4,.webm,.mov,image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" multiple onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setResult(null); setDrafts([]); setError(""); }} className="ml-2" /></label>
          <p className="text-xs text-foreground/55">JPEG, PNG, or WebP; up to {MAX_ASSET_UPLOAD_IMAGES} images, {Math.round(MAX_ASSET_UPLOAD_BYTES / (1024 * 1024))} MiB each. Or one MP4, WebM, or MOV video up to {Math.round(MAX_ASSET_UPLOAD_VIDEO_BYTES / (1024 * 1024))} MB. The server checks file content and size.</p>
          <label className="block">Reference scale (optional){" "}
            <input value={scale} onChange={(e) => setScale(e.target.value)} placeholder="e.g. the door is 0.9 m wide" className="w-72 max-w-full rounded border border-foreground/20 bg-background px-2 py-1" />
          </label>
          <button type="button" onClick={upload} disabled={busy || files.length === 0} className="rounded-full bg-foreground px-4 py-1.5 text-background disabled:opacity-50">{busy ? "Identifying." : files.some(isVideoFile) ? "Identify assets from video" : "Identify assets"}</button>
        </div>
        {error && <p role="alert" className="mt-3">{error}</p>}
        {result && (
          <div className="mt-4">
            <p role="status" className={`rounded border px-3 py-2 ${result.mode !== "live" ? "border-foreground/50 bg-foreground/5 font-medium" : "border-foreground/20"}`}>
              Mode: {result.mode}. {result.notice}
            </p>
            {result.mode === "failed" && <p role="alert" className="mt-2 text-sm font-medium">Identification failed. Nothing was extracted from your media; no assets were proposed.</p>}
            {result.source === "video" && result.frames && <p className="mt-2 text-xs text-foreground/65">Extracted from video frames at t={result.frames.map((f) => `${f.t}s`).join(", ")}.</p>}
            {result.mode === "fixture" && <p className="mt-2 text-sm font-medium">These are sample placeholders, not results from your photos, and cannot be saved.</p>}
            {drafts.length === 0 && result.mode !== "failed" && <p className="mt-3">The service proposed no assets.</p>}
            <ul className="mt-3 space-y-3">
              {drafts.map((d) => (
                <li key={d.assetId} className="rounded-lg border border-foreground/15 p-3">
                  <div className="flex gap-3">
                    <FootprintSvg asset={d} size={90} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">{saved.includes(d.assetId) ? <span className="font-medium">Saved</span> : <DraftBadge />}</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <input aria-label="Name" value={d.name} disabled={saved.includes(d.assetId)} onChange={(e) => edit(d.assetId, (a) => ({ ...a, name: e.target.value }))} className="rounded border border-foreground/20 bg-background px-2 py-1" />
                        <select aria-label="Category" value={d.category} disabled={saved.includes(d.assetId)} onChange={(e) => edit(d.assetId, (a) => ({ ...a, category: e.target.value as AssetCategory }))} className="rounded border border-foreground/20 bg-background px-2 py-1">
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
                        </select>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {(["w", "d", "h"] as const).map((k) => (
                          <label key={k} className="text-xs">{k} (m){" "}
                            <input type="number" step={0.05} min={0.05} value={d.dims[k]} disabled={saved.includes(d.assetId)}
                              onChange={(e) => edit(d.assetId, (a) => editDims(a, k, Number(e.target.value)))}
                              className="w-20 rounded border border-foreground/20 bg-background px-2 py-1" />
                          </label>
                        ))}
                      </div>
                      <fieldset className="mt-2 rounded border border-dashed border-foreground/30 p-2" disabled={saved.includes(d.assetId)}>
                        <legend className="px-1 text-xs">Style <span className="italic">(inferred from the photo, edit freely)</span></legend>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <label>Materials <input aria-label="Materials" value={(d.style?.materials ?? []).join(", ")} onChange={(e) => editStyle(d.assetId, { materials: splitList(e.target.value) })} placeholder="brushed steel, oak" className="w-44 rounded border border-foreground/20 bg-background px-2 py-1" /></label>
                          <label>Colours (hex) <input aria-label="Colours" aria-invalid={badColors(d).length > 0} value={(d.style?.colors ?? []).join(", ")} onChange={(e) => editStyle(d.assetId, { colors: splitList(e.target.value) })} placeholder="#b0b3b8, #2b2b2b" className="w-44 rounded border border-foreground/20 bg-background px-2 py-1" /></label>
                          <label>Finish <input aria-label="Finish" value={d.style?.finish ?? ""} onChange={(e) => editStyle(d.assetId, { finish: e.target.value.trim() ? e.target.value : null })} placeholder="matte" className="w-28 rounded border border-foreground/20 bg-background px-2 py-1" /></label>
                          <label>Style tags <input aria-label="Style tags" value={(d.style?.styleTags ?? []).join(", ")} onChange={(e) => editStyle(d.assetId, { styleTags: splitList(e.target.value) })} placeholder="industrial" className="w-36 rounded border border-foreground/20 bg-background px-2 py-1" /></label>
                        </div>
                        {(d.style?.colors ?? []).length > 0 && <p className="mt-1 flex items-center gap-1 text-xs">{(d.style?.colors ?? []).filter((c) => HEX_COLOR.test(c)).map((c) => <span key={c} title={c} className="inline-block size-4 rounded border border-foreground/30" style={{ background: c }} />)}</p>}
                        {badColors(d).length > 0 && <p role="alert" className="mt-1 text-xs">Colours must be #rrggbb hex values: {badColors(d).join(", ")}</p>}
                      </fieldset>
                      <AssetFacts asset={d} />
                      <p className="mt-1 text-xs text-foreground/55">{d.provenance.notes}</p>
                      {!saved.includes(d.assetId) && result.mode === "live" && <button type="button" onClick={() => confirm(d)} disabled={badColors(d).length > 0} className="mt-2 disabled:opacity-50 rounded-full bg-foreground px-3 py-1 text-xs text-background">Confirm and save</button>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
