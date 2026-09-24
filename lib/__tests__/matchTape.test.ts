import { describe, expect, it } from 'vitest';

import type { MatchEvent, MatchTapeAnchor } from '@/data/types';
import { MATCH_TAPE_DEMO_COPY, MATCH_TAPE_LIVE_COPY, matchTapeDisclaimer } from '@/lib/honesty';
import {
  anchorableEvents,
  buildMatchTapeShareMessage,
  buildTapeAnchor,
  dmTapeThreadKey,
  fixturesForTapePicker,
  gateTapeMessage,
  governingTape,
  mergeMatchTapes,
  parseMatchTapeAnchor,
  planMatchTapeArchive,
  planMatchTapeAttach,
  sampleTapeEvents,
  tapeErrorMessage,
  tapeEventsFor,
  tapeIsLocked,
  tapeScoreline,
  type TapeTeams,
} from '@/lib/matchTape';
import { archiveMatchTape, attachMatchTape, createDmGroup, sendDirectMessage, sendGroupMessage, signInDemo } from '@/services/appState';
import { defaults } from '@/services/appState';

const teams: TapeTeams = { homeName: 'Liverpool', awayName: 'Arsenal', homeShort: 'LIV', awayShort: 'ARS' };

const goal: MatchEvent = {
  id: 'e67',
  type: 'goal',
  minute: 67,
  teamId: 'liv',
  playerName: 'Salah',
};

function attached(now = 1_700_000_000_000) {
  return planMatchTapeAttach({
    rows: [],
    id: 'tape-demo-maya',
    kind: 'dm',
    threadKey: dmTapeThreadKey('maya', 'omar'),
    matchId: 'fx-liv-ars',
    attachedBy: 'maya',
    teams,
    kickoff: '2026-09-24T19:00:00.000Z',
    now,
  });
}

describe('match tape rules', () => {
  it('keeps one active attachment and lets an archive clear the slot', () => {
    const first = attached();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = planMatchTapeAttach({
      rows: [first.value],
      id: 'tape-demo-omar',
      kind: 'dm',
      threadKey: first.value.threadKey,
      matchId: 'fx-mci-che',
      attachedBy: 'omar',
      teams,
      now: 1_700_000_100_000,
    });
    expect(second.ok).toBe(false);
    const archived = planMatchTapeArchive([first.value], first.value.id, 1_700_000_200_000, {
      homeScore: 2,
      awayScore: 1,
      minute: 90,
      matchStatus: 'finished',
    });
    expect(archived.ok).toBe(true);
    if (!archived.ok) return;
    expect(tapeIsLocked(governingTape([archived.value], first.value.threadKey))).toBe(true);
    const again = planMatchTapeAttach({
      rows: [archived.value],
      id: 'tape-demo-next',
      kind: 'dm',
      threadKey: first.value.threadKey,
      matchId: 'fx-mci-che',
      attachedBy: 'omar',
      teams,
      now: 1_700_000_300_000,
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(governingTape([archived.value, again.value], first.value.threadKey)?.status).toBe('active');
  });

  it('anchors a goal and refuses a different match, a long caption, and a locked thread', () => {
    const tape = attached();
    expect(tape.ok).toBe(true);
    if (!tape.ok) return;
    const anchor = buildTapeAnchor('fx-liv-ars', goal, 'LIV');
    expect(anchor).toMatchObject({ eventKey: 'e67', minute: 67, eventType: 'goal', label: "67' Salah goal" });
    expect(gateTapeMessage([tape.value], tape.value.threadKey, 'Unreal.', anchor).ok).toBe(true);
    const other = { ...anchor!, matchId: 'fx-mci-che' };
    const wrong = gateTapeMessage([tape.value], tape.value.threadKey, 'Nope', other);
    expect(wrong.ok).toBe(false);
    const long = gateTapeMessage([tape.value], tape.value.threadKey, 'x'.repeat(161), anchor);
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.error).toMatch(/160/);
    const archived = planMatchTapeArchive([tape.value], tape.value.id, 1_700_000_200_000);
    expect(archived.ok).toBe(true);
    if (!archived.ok) return;
    const locked = gateTapeMessage([archived.value], tape.value.threadKey, 'Late', null);
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.error).toMatch(/read-only/);
    expect(parseMatchTapeAnchor({ ...anchor, url: 'https://example.com' })).toBeNull();
    expect(anchorableEvents([{ ...goal, type: 'var', id: 'var1' }, goal])).toEqual([goal]);
  });

  it('labels demo sample events and builds a share card without a url', () => {
    expect(tapeEventsFor([], 'fx-liv-ars', true).sample).toBe(true);
    expect(sampleTapeEvents('fx-liv-ars')[0]?.id.startsWith('demo:')).toBe(true);
    expect(tapeEventsFor([goal], 'fx-liv-ars', true).sample).toBe(false);
    expect(tapeEventsFor([], 'fx-liv-ars', false).events).toEqual([]);
    const card = buildMatchTapeShareMessage({
      scoreline: 'LIV 2–1 ARS · FT',
      takes: [{ author: 'Maya', label: "67' Salah goal", text: 'Unreal.' }],
    });
    expect(card).toMatch(/Zápasová páska/);
    expect(card).toMatch(/LIV 2–1 ARS/);
    expect(card).toMatch(/Maya: Unreal/);
    expect(card).not.toMatch(/https?:\/\//);
    expect(matchTapeDisclaimer(false)).toBe(MATCH_TAPE_DEMO_COPY);
    expect(matchTapeDisclaimer(true)).toBe(MATCH_TAPE_LIVE_COPY);
    expect(MATCH_TAPE_DEMO_COPY).toMatch(/this device/i);
    expect(MATCH_TAPE_DEMO_COPY).toMatch(/not a live feed/i);
  });

  it('sorts live fixtures ahead of upcoming ones in the picker', () => {
    const rows = fixturesForTapePicker(
      [
        { id: 'fx-later', ...teams, status: 'upcoming', homeScore: 0, awayScore: 0, kickoff: '2026-09-25T15:00:00.000Z' },
        { id: 'fx-now', ...teams, status: 'live', minute: 12, homeScore: 1, awayScore: 0, kickoff: '2026-09-24T15:00:00.000Z' },
        { id: 'fx-old', ...teams, status: 'finished', homeScore: 0, awayScore: 0, kickoff: '2026-09-20T15:00:00.000Z' },
      ],
      'liv',
    );
    expect(rows.map((row) => row.id)).toEqual(['fx-now', 'fx-later', 'fx-old']);
    expect(tapeScoreline({ homeShort: 'LIV', awayShort: 'ARS', statusLabel: 'Upcoming', upcoming: true })).toBe(
      'LIV vs ARS · Upcoming',
    );
  });

  it('stores an anchor on the DM and locks the thread after archive', () => {
    let state = signInDemo(defaults(), 'maya');
    const threadKey = dmTapeThreadKey('maya', 'omar');
    const attachedRow = attachMatchTape(
      state,
      { kind: 'dm', threadKey, matchId: 'fx-liv-ars', teams, kickoff: '2026-09-24T19:00:00.000Z' },
      1_700_000_000_000,
    );
    expect(attachedRow.result.ok).toBe(true);
    if (!attachedRow.result.ok) return;
    state = attachedRow.state;
    const anchor = buildTapeAnchor('fx-liv-ars', goal, 'LIV') as MatchTapeAnchor;
    const sent = sendDirectMessage(state, 'omar', 'What a hit', 1_700_000_010_000, undefined, anchor);
    expect(sent.result.ok).toBe(true);
    if (!sent.result.ok) return;
    expect(sent.result.message.tape?.eventKey).toBe('e67');
    state = sent.state;
    const archived = archiveMatchTape(state, attachedRow.result.attachment.id, 1_700_000_020_000, {
      homeScore: 2,
      awayScore: 1,
      matchStatus: 'finished',
    });
    expect(archived.result.ok).toBe(true);
    state = archived.state;
    const blocked = sendDirectMessage(state, 'omar', 'One more', 1_700_000_040_000);
    expect(blocked.result.ok).toBe(false);
    if (blocked.result.ok) return;
    expect(blocked.result.error).toMatch(/read-only/);
    const replaced = attachMatchTape(
      state,
      { kind: 'dm', threadKey, matchId: '9001', teams },
      1_700_000_050_000,
    );
    expect(replaced.result.ok).toBe(true);
  });

  it('anchors a group message only while that group tape is active', () => {
    let state = signInDemo(defaults(), 'maya');
    const created = createDmGroup(state, ['omar', 'jordan'], 'Derby', 1_700_000_000_000);
    expect(created.result.ok).toBe(true);
    if (!created.result.ok) return;
    state = created.state;
    const groupId = created.result.group.id;
    const attachedRow = attachMatchTape(
      state,
      { kind: 'group', threadKey: groupId, matchId: 'fx-liv-ars', teams },
      1_700_000_001_000,
    );
    expect(attachedRow.result.ok).toBe(true);
    if (!attachedRow.result.ok) return;
    state = attachedRow.state;
    const anchor = buildTapeAnchor('fx-liv-ars', goal, 'LIV') as MatchTapeAnchor;
    const sent = sendGroupMessage(state, groupId, 'Box it', 1_700_000_011_000, undefined, anchor);
    expect(sent.result.ok).toBe(true);
    if (!sent.result.ok) return;
    expect(sent.result.message.tape?.minute).toBe(67);
    state = archiveMatchTape(sent.state, attachedRow.result.attachment.id, 1_700_000_020_000).state;
    expect(sendGroupMessage(state, groupId, 'Still open?', 1_700_000_040_000).result.ok).toBe(false);
  });

  it('lets an archived remote row win over a local active copy', () => {
    const local = attached();
    expect(local.ok).toBe(true);
    if (!local.ok) return;
    const remote = planMatchTapeArchive([local.value], local.value.id, 1_700_000_200_000, {
      homeScore: 1,
      awayScore: 1,
      matchStatus: 'finished',
    });
    expect(remote.ok).toBe(true);
    if (!remote.ok) return;
    const merged = mergeMatchTapes([local.value], [remote.value]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe('archived');
    expect(merged[0]?.homeScore).toBe(1);
    expect(tapeErrorMessage('tape_active')).toMatch(/already has a match/);
    expect(tapeErrorMessage('mystery')).toMatch(/Try again/);
  });
});
