"use client";

import { useEffect, useRef, useState } from "react";

type Saved = { name: string; kind: "image" | "video"; bytes: number };
const mb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function ReferenceMediaPage() {
  const [profileId, setProfileId] = useState("fruity-yogurt");
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
      else { setFiles([]); if (input.current) input.current.value = ""; setReload((n) => n + 1); }
    };
    xhr.send(body);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm">
      <h1 className="text-2xl font-semibold">Reference media</h1>
      <p className="mt-2 text-neutral-600">
        Upload photos or a video of the reference restaurant. Files are saved on this machine only (not in git) so the objects and the look can be
        extracted into this profile&apos;s catalog. Nothing is identified at upload time, and you review every inferred name, size and appearance later.
      </p>
      <label className="mt-6 block">Profile
        <input value={profileId} onChange={(e) => setProfileId(e.target.value)} aria-label="Profile id" className="ml-2 rounded border px-2 py-1" />
      </label>
      <label className="mt-4 block">Photos or video
        <input ref={input} type="file" multiple aria-label="Photos or video" className="ml-2"
          accept=".jpg,.jpeg,.png,.webp,.heic,.mp4,.mov,.webm,.m4v,image/*,video/*"
          onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setMessage(""); setError(""); }} />
      </label>
      {files.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-neutral-700">
          {files.map((f) => <li key={f.name + f.size}>{f.name} ({mb(f.size)})</li>)}
        </ul>
      )}
      <button type="button" onClick={upload} disabled={!files.length || progress !== null}
        className="mt-4 rounded-full bg-black px-5 py-2 text-white disabled:opacity-40">
        {progress === null ? "Upload" : `Uploading ${progress}%`}
      </button>
      {message && <p role="status" className="mt-4 text-green-700">{message}</p>}
      {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
      <h2 className="mt-8 font-medium">Saved for “{profileId}”</h2>
      {saved.length === 0 ? <p className="mt-1 text-neutral-500">Nothing saved yet.</p> : (
        <ul className="mt-1 list-disc pl-5">{saved.map((s) => <li key={s.name}>{s.kind}: {s.name} ({mb(s.bytes)})</li>)}</ul>
      )}
    </main>
  );
}
