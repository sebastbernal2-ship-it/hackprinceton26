import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFindings, surfaceOf } from '../src/findings.ts';

const good = {
  id: 'f1', roomId: null, category: 'plumbing', title: 't', description: 'd', severity: 'medium', modelConfidence: 0.4,
  evidence: { source: 'panorama', ref: 'r', region: null }, canConfirmFromImagery: false, verificationStep: 'look', costLineItemIds: ['c1'],
  anchor: { x: 1, y: 2, z: 3 },
};

test('accepts a valid finding with anchor, wrapped or bare', () => {
  assert.equal(parseFindings({ findings: [good] }).findings.length, 1);
  assert.deepEqual(parseFindings([good]).findings[0].anchor, { x: 1, y: 2, z: 3 });
});
test('rejects instead of repairing', () => {
  const bad = [
    { ...good, id: 'a', modelConfidence: 1.2 },
    { ...good, id: 'b', verificationStep: '' },
    { ...good, id: 'c', severity: 'critical' },
    { ...good, id: 'd', anchor: { x: 1 } },
    { ...good, id: 'e', evidence: { source: 'imagination', ref: 'x', region: null } },
    good, { ...good },
  ];
  const r = parseFindings(bad);
  assert.equal(r.findings.length, 1);
  assert.deepEqual(r.rejected.map((x) => x.id), ['a', 'b', 'c', 'd', 'e', 'f1']);
  assert.equal(r.rejected.at(-1)?.reason, 'duplicate id');
});
test('surfaceOf prefers the producer, then the measurement, else unknown', () => {
  assert.equal(surfaceOf({ ...good, surfaceStatus: 'inferred' } as never, 'captured'), 'inferred');
  assert.equal(surfaceOf(good as never, 'captured'), 'captured');
  assert.equal(surfaceOf(good as never, null), 'unknown');
});
test('non-list input is reported', () => {
  assert.equal(parseFindings({ nope: 1 }).rejected.length, 1);
});

import { describeFinding } from '../src/findings.ts';
test('describeFinding keeps the honest wording and warns on inferred surfaces', () => {
  const f = parseFindings([good]).findings[0];
  const d = describeFinding(f, 'inferred', false);
  assert.match(d.notice, /not a confirmed defect/);
  assert.match(d.warning ?? '', /not evidence/);
  assert.ok(d.rows.some((r) => /not a probability/.test(r.text)));
  assert.ok(d.rows.some((r) => r.label === 'An on-site inspector must verify' && r.text === 'look'));
  assert.equal(describeFinding(f, 'captured', false).warning, null);
});
