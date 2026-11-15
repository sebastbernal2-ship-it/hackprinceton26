"use client";

import { useState, type ReactNode } from "react";
import AssetCatalog from "./asset-catalog";
import ProfileAnswers from "./profile-answers";
import ReferenceMedia from "./reference-media";

const DEFAULT_PROFILE = "fruity-yogurt";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 border-t border-foreground/10 pt-6">
      <h2 id={`${id}-h`} className="text-xl font-medium tracking-tight">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function Profile() {
  const [profileId, setProfileId] = useState(DEFAULT_PROFILE);
  const [reload, setReload] = useState(0);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <header className="animate-rise">
        <h1 className="text-[clamp(1.6rem,4vw,2.5rem)] font-medium leading-tight tracking-tight">Profile</h1>
        <label className="mt-3 block text-sm text-foreground/60">
          Profile id{" "}
          <input value={profileId} onChange={(e) => setProfileId(e.target.value.trim() || DEFAULT_PROFILE)} aria-label="Profile id"
            className="ml-1 w-44 max-w-full rounded border border-foreground/20 bg-background px-2 py-1 text-foreground" />
        </label>
      </header>
      <Section id="answers" title="Your answers"><ProfileAnswers /></Section>
      <Section id="reference-media" title="Reference restaurant photos and video">
        <ReferenceMedia profileId={profileId} onSaved={() => setReload((n) => n + 1)} />
      </Section>
      <Section id="catalog" title="Asset catalog"><AssetCatalog profileId={profileId} reload={reload} /></Section>
    </div>
  );
}
