"use client";

import { useEffect, useRef, useState } from "react";

type Saved = { name: string; kind: "image" | "video"; bytes: number };
const mb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function ReferenceMedia({ profileId, onSaved }: { profileId: string; onSaved?: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Saved[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    fetch(`/api/reference-media?profileId=${encodeURIComponent(profileId)}`)
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then((j: { files: Saved[] }) => { if (live) setSaved(j.files); })
      .catch(() => { /* the list is a convenience; the upload message reports API problems */ });
    return () => { live = false; };
  }, [profileId, reload]);

  function upload() {
    if (!files.length) return;
    setError(""); setMessage(""); setProgress(0);
    const body = new FormData();
    body.append("profileId", profileId);
    files.forEach((f) => body.append("files", f));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/reference-media");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onerror = () => { setProgress(null); setError("Could not reach the API. Is it running on port 8000?"); };
    xhr.onload = () => {
      setProgress(null);
      let detail = "";
      try { const j = JSON.parse(xhr.responseText); detail = j.detail ?? ""; if (xhr.status === 200) setMessage(`Saved ${j.saved.length} file(s). ${j.note}`); } catch { /* non-JSON error body */ }
      if (xhr.status !== 200) setError(detail || `Upload failed (HTTP ${xhr.status}).`);
      else { setFiles([]); if (input.current) input.current.value = ""; setReload((n) => n + 1); onSaved?.(); }
    };
    xhr.send(body);
  }

  return (
    <div className="text-sm">
      <p className="text-foreground/60">
        Upload photos or a video of the reference restaurant. Files are saved on this machine only (not in git) so the objects and the look can be
        extracted into this profile&apos;s catalog. Nothing is identified at upload time, and you review every inferred name, size and appearance later.
      </p>
      <label className="mt-4 block">Photos or video
        <input ref={input} type="file" multiple aria-label="Photos or video" className="mt-1 block max-w-full"
          accept=".jpg,.jpeg,.png,.webp,.heic,.mp4,.mov,.webm,.m4v,image/*,video/*"
          onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setMessage(""); setError(""); }} />
      </label>
      {files.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-foreground/70">
          {files.map((f) => <li key={f.name + f.size} className="break-all">{f.name} ({mb(f.size)})</li>)}
        </ul>
      )}
      <button type="button" onClick={upload} disabled={!files.length || progress !== null}
        className="mt-4 rounded-full bg-foreground px-5 py-2 text-background disabled:opacity-40">
        {progress === null ? "Upload" : `Uploading ${progress}%`}
      </button>
      {message && <p role="status" className="mt-4 text-match">{message}</p>}
      {error && <p role="alert" className="mt-4 text-accent">{error}</p>}
      <h3 className="mt-6 font-medium">Saved for &ldquo;{profileId}&rdquo;</h3>
      {saved.length === 0 ? <p className="mt-1 text-foreground/55">Nothing saved yet.</p> : (
        <ul className="mt-1 list-disc pl-5">{saved.map((s) => <li key={s.name} className="break-all">{s.kind}: {s.name} ({mb(s.bytes)})</li>)}</ul>
      )}
    </div>
  );
}
