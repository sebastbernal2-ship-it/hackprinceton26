import { describe, expect, it } from "vitest";
import { parseBriefRegex } from "@/lib/agent/brief";
import { briefQuery, briefSummary, clarifyPrompt, isBriefComplete, missingFields, readAnswer } from "@/components/flow/brief-flow";
import { createFlowState, flowReducer, lastOfKind, pendingClarify, type FlowState } from "@/components/flow/flow-reducer";

const spaces = [
  { siteId: "a", photo: "/a.jpg", address: "1 Main St" },
  { siteId: "b", photo: "/b.jpg", address: "2 Main St" },
];
const send = (s: FlowState, text: string, at = 1) => flowReducer(s, { type: "send", text, parsed: parseBriefRegex(text), at });
const kinds = (s: FlowState) => s.messages.map((m) => m.kind);

describe("brief completeness", () => {
  it("knows what is missing, in asking order", () => {
    expect(missingFields(parseBriefRegex("coffee shop in Los Angeles"))).toEqual(["seats", "budgetUsd"]);
    expect(missingFields(parseBriefRegex("ramen bar, 30 seats, Koreatown"))).toEqual(["budgetUsd"]);
    expect(isBriefComplete(parseBriefRegex("taqueria, 40 seats, $150k budget, Houston"))).toBe(true);
  });

  it("reads typed answers as the thing that was asked", () => {
    const read = (f: "seats" | "budgetUsd", t: string) => readAnswer(f, t, parseBriefRegex(t));
    expect(read("seats", "40")).toBe(40);
    expect(read("seats", "about 55 seats")).toBe(55);
    expect(read("seats", "$200k")).toBeUndefined();
    expect(read("seats", "not sure")).toBeUndefined();
    expect(read("budgetUsd", "150")).toBe(150_000);
    expect(read("budgetUsd", "$200k")).toBe(200_000);
    expect(read("budgetUsd", "300000")).toBe(300_000);
    expect(read("budgetUsd", "no idea")).toBeUndefined();
  });

  it("offers the default among the chips", () => {
    const brief = parseBriefRegex("taqueria in Houston");
    expect(clarifyPrompt("seats", brief).options.map((o) => o.value)).toContain(40);
    expect(clarifyPrompt("budgetUsd", brief).options.map((o) => o.value)).toContain(250_000);
  });

  it("writes a query the parser reads back the same", () => {
    const text = "Coffee shop in Los Angeles.";
    const said = parseBriefRegex(text);
    const q = briefQuery(text, said, { ...said, seats: 25, budgetUsd: 250_000 });
    expect(q).toBe("Coffee shop in Los Angeles, 25 seats, $250,000 budget");
    expect(parseBriefRegex(q)).toMatchObject({ concept: "cafe", city: "Los Angeles", seats: 25, budgetUsd: 250_000 });
  });

  it("says the brief back, with nothing it assumed", () => {
    const s = briefSummary({ concept: "fast-casual", cuisine: "Mexican", seats: 40, budgetUsd: 150_000, city: "Houston" }, 12);
    expect(s).toContain("a 40-seat fast-casual place, Mexican in Houston, with about $150k");
    expect(s).not.toContain("I went with");
    expect(s).toContain("all 12 spaces");
  });
});

describe("flowReducer", () => {
  it("goes straight to search when the brief is complete", () => {
    const s = send(createFlowState({ spaces }), "taqueria, 40 seats, $150k budget, Houston");
    expect(s.phase).toBe("search");
    expect(kinds(s)).toEqual(["user", "assistantText", "searchProgress"]);
    expect(s.query).toBe("taqueria, 40 seats, $150k budget, Houston");
    const progress = lastOfKind(s, "searchProgress")!;
    expect(progress).toMatchObject({ status: "running", checked: 0, total: 2 });
    expect(progress.candidates.map((c) => c.state)).toEqual(["queued", "queued"]);
    expect(new Set(s.messages.map((m) => m.id)).size).toBe(3);
  });

  it("asks for seats, then budget, once each, then searches", () => {
    let s = send(createFlowState({ spaces }), "coffee shop in Los Angeles");
    expect(s.phase).toBe("clarify");
    expect(pendingClarify(s)?.field).toBe("seats");

    s = flowReducer(s, { type: "answer", messageId: pendingClarify(s)!.id, value: 25, at: 2 });
    expect(s.brief?.seats).toBe(25);
    expect(pendingClarify(s)?.field).toBe("budgetUsd");

    const budget = pendingClarify(s)!;
    s = flowReducer(s, { type: "answer", messageId: budget.id, value: 250_000, at: 3 });
    expect(s.phase).toBe("search");
    expect(pendingClarify(s)).toBeNull();
    expect(kinds(s)).toEqual(["user", "clarifyChips", "clarifyChips", "assistantText", "searchProgress"]);
    expect(parseBriefRegex(s.query!)).toMatchObject({ seats: 25, budgetUsd: 250_000, city: "Los Angeles" });

    // an answered chip is locked
    expect(flowReducer(s, { type: "answer", messageId: budget.id, value: 500_000, at: 4 })).toBe(s);
  });

  it("takes a typed answer, and everything else it carries", () => {
    let s = send(createFlowState({ spaces }), "pizza place");
    s = send(s, "60 seats and $400k, Houston", 2);
    expect(s.phase).toBe("search");
    expect(s.brief).toMatchObject({ seats: 60, budgetUsd: 400_000, city: "Houston" });
  });

  it("never assumes a number: an unreadable answer rewords the same question and stays open", () => {
    let s = send(createFlowState({ spaces }), "ramen bar, 30 seats, Koreatown");
    expect(pendingClarify(s)?.field).toBe("budgetUsd");
    const id = pendingClarify(s)!.id;
    s = send(s, "not sure yet", 2);
    expect(s.phase).toBe("clarify");
    expect(s.query).toBeNull();
    expect(s.brief?.budgetUsd).toBeUndefined();
    expect(pendingClarify(s)?.id).toBe(id);
    expect(pendingClarify(s)?.question).toMatch(/did not catch that/i);
    expect(s.messages.filter((m) => m.kind === "clarifyChips")).toHaveLength(1);
    // a readable answer then goes through
    s = send(s, "$180k", 3);
    expect(s.phase).toBe("search");
    expect(s.brief?.budgetUsd).toBe(180_000);
  });

  it("asks for the concept when the words name none, and never defaults it", () => {
    let s = send(createFlowState({ spaces }), "a place with 30 seats, $200k, Houston");
    expect(s.conceptKnown).toBe(false);
    expect(pendingClarify(s)?.field).toBe("concept");
    expect(pendingClarify(s)?.options.map((o) => o.value)).toContain("full-service");
    s = send(s, "no idea", 2);
    expect(pendingClarify(s)?.field).toBe("concept");
    expect(s.query).toBeNull();
    s = flowReducer(s, { type: "answer", messageId: pendingClarify(s)!.id, value: "cafe", at: 3 });
    expect(s.phase).toBe("search");
    expect(s.brief?.concept).toBe("cafe");
    expect(parseBriefRegex(s.query!)).toMatchObject({ concept: "cafe", seats: 30, budgetUsd: 200_000 });
  });

  it("leaves a free-text line with no open question to the caller (no canned reply)", () => {
    let s = send(createFlowState({ spaces }), "taqueria, 40 seats, $150k budget, Houston");
    const before = s.messages.length;
    s = send(s, "what about parking?", 2);
    expect(s.messages).toHaveLength(before + 1);
    expect(lastOfKind(s, "user")?.text).toBe("what about parking?");
  });

  it("ignores empty sends and lets later steps append and update messages", () => {
    const empty = createFlowState({ spaces });
    expect(send(empty, "   ")).toBe(empty);

    let s = send(empty, "taqueria, 40 seats, $150k budget, Houston");
    const id = lastOfKind(s, "searchProgress")!.id;
    s = flowReducer(s, { type: "update", id, update: (m) => (m.kind === "searchProgress" ? { ...m, checked: 1 } : m) });
    expect(lastOfKind(s, "searchProgress")?.checked).toBe(1);

    s = flowReducer(s, {
      type: "append",
      at: 5,
      message: {
        kind: "pickCards",
        intro: "Here are the 3 I'd look at",
        picks: [{ siteId: "a", rank: 1, photo: "/a.jpg", address: "1 Main St", city: "Houston", sf: 1500, allInUsd: { low: 1, high: 2 }, reason: "r", hasScan: true }],
      },
    });
    s = flowReducer(s, { type: "phase", phase: "pick" });
    expect(flowReducer(s, { type: "pick", siteId: "zzz" })).toBe(s);
    s = flowReducer(s, { type: "pick", siteId: "a" });
    expect(s.phase).toBe("walk");
    expect(lastOfKind(s, "pickCards")?.chosenSiteId).toBe("a");
    s = flowReducer(s, { type: "back" });
    expect(s.phase).toBe("pick");
    expect(lastOfKind(s, "pickCards")?.chosenSiteId).toBeUndefined();
  });

  it("resets to Ask without reusing message ids", () => {
    const s = send(createFlowState({ spaces }), "taqueria, 40 seats, $150k budget, Houston");
    const r = flowReducer(s, { type: "reset" });
    expect(r).toMatchObject({ phase: "ask", messages: [], brief: null, query: null, spaces });
    expect(r.seq).toBe(s.seq);
  });
});
