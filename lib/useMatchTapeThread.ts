import { useEffect, useMemo, useRef, useState } from 'react';

import type { MatchTapeAnchor } from '@/data/types';
import { shouldPersistDms } from '@/lib/dms';
import { matchTapeDisclaimer } from '@/lib/honesty';
import {
  buildMatchTapeShareMessage,
  buildTapeAnchor,
  dmTapeThreadKey,
  fixtureChoiceFrom,
  fixturesForTapePicker,
  isSampleAnchor,
  shouldAutoArchive,
  tapeEventsFor,
  tapeIsLocked,
  tapeScoreline,
  tapeStatusLabel,
  tapeTeamsFrom,
  type TapeFixtureChoice,
} from '@/lib/matchTape';
import { sharePlainText } from '@/lib/sharePostNative';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { useFootballCatalog } from '@/lib/useFootballCatalog';

export type MatchTapeTarget = { kind: 'dm'; peerId: string } | { kind: 'group'; groupId: string };

export type MatchTapeMessage = {
  senderId: string;
  text: string;
  createdAt: string;
  tape?: MatchTapeAnchor;
};

export function useMatchTapeThread(target: MatchTapeTarget | null, messages: readonly MatchTapeMessage[]) {
  const app = useApp();
  const catalog = useFootballCatalog();
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState<MatchTapeAnchor | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const archiveAttempt = useRef<string | null>(null);
  const archiveFn = useRef(app.archiveMatchTape);
  archiveFn.current = app.archiveMatchTape;

  const userId = app.currentUser?.id ?? null;
  const threadKey =
    target && userId
      ? target.kind === 'dm'
        ? dmTapeThreadKey(userId, target.peerId)
        : target.groupId
      : null;
  const attachment = threadKey ? app.tapeForThread(threadKey) : null;
  const live = shouldPersistDms(app.supabaseConfigured, app.authMode);

  useEffect(() => football.subscribe(() => setRevision((n) => n + 1)), []);

  const fixture = attachment ? football.getFixture(attachment.matchId) : undefined;
  void catalog.ready;
  void revision;

  const matchId = attachment?.status === 'active' ? attachment.matchId : null;
  useEffect(() => {
    if (!matchId) return;
    const tick = () => {
      void football.hydrate();
      void football.ensureMatchDetail(matchId);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [matchId]);

  useEffect(() => {
    if (!attachment || attachment.status !== 'active') return;
    const current = football.getFixture(attachment.matchId);
    if (!shouldAutoArchive(current?.status)) return;
    if (archiveAttempt.current === attachment.id) return;
    archiveAttempt.current = attachment.id;
    void archiveFn
      .current(attachment.id, {
        homeScore: current?.homeScore,
        awayScore: current?.awayScore,
        minute: current?.minute,
        matchStatus: 'finished',
      })
      .then((result) => {
        if (!result.ok) archiveAttempt.current = null;
      });
  }, [attachment, fixture?.awayScore, fixture?.homeScore, fixture?.status]);

  useEffect(() => {
    setPending(null);
  }, [attachment?.id, attachment?.status]);

  const choices = useMemo(() => {
    return football.getFixtures().flatMap((row) => {
      const home = football.getTeam(row.homeTeamId);
      const away = football.getTeam(row.awayTeamId);
      const teams = tapeTeamsFrom(
        home?.name ?? '',
        away?.name ?? '',
        home?.code || home?.shortName || '',
        away?.code || away?.shortName || '',
      );
      return teams ? [fixtureChoiceFrom(row, teams)] : [];
    });
  }, [catalog.lastSyncedAt, catalog.source, revision]);

  const listed = fixturesForTapePicker(choices, query);
  const eventPack = tapeEventsFor(fixture?.events ?? [], attachment?.matchId ?? '', !live);
  const status = fixture?.status ?? attachment?.matchStatus;
  const minute = fixture?.minute ?? attachment?.minute;
  const homeScore = fixture?.homeScore ?? attachment?.homeScore;
  const awayScore = fixture?.awayScore ?? attachment?.awayScore;
  const hasBoard = !!fixture || homeScore != null || !!status;
  const clockOnBadge = status === 'live' || status === 'ht';
  const scoreline = !attachment
    ? ''
    : hasBoard
      ? tapeScoreline({
          homeShort: attachment.homeShort,
          awayShort: attachment.awayShort,
          homeScore,
          awayScore,
          statusLabel: tapeStatusLabel(status, minute),
          upcoming: status === 'upcoming',
        })
      : `${attachment.homeShort} vs ${attachment.awayShort}`;
  const headerLine =
    clockOnBadge && hasBoard
      ? tapeScoreline({
          homeShort: attachment!.homeShort,
          awayShort: attachment!.awayShort,
          homeScore,
          awayScore,
          statusLabel: '',
        })
      : scoreline;

  async function attach(choice: TapeFixtureChoice) {
    if (!target || !threadKey || busy) return;
    setBusy(true);
    setNote(null);
    const result = await app.attachMatchTape({
      kind: target.kind,
      threadKey,
      matchId: choice.id,
      teams: {
        homeName: choice.homeName,
        awayName: choice.awayName,
        homeShort: choice.homeShort,
        awayShort: choice.awayShort,
      },
      kickoff: choice.kickoff,
    });
    setBusy(false);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    setAttachOpen(false);
    setQuery('');
  }

  async function archive() {
    if (!attachment || busy) return;
    setBusy(true);
    setNote(null);
    const result = await app.archiveMatchTape(attachment.id, {
      homeScore: fixture?.homeScore ?? attachment.homeScore,
      awayScore: fixture?.awayScore ?? attachment.awayScore,
      minute: fixture?.minute ?? attachment.minute,
      matchStatus: fixture?.status ?? attachment.matchStatus,
    });
    setBusy(false);
    if (!result.ok) setNote(result.error);
  }

  function pickEvent(eventId: string) {
    if (!attachment) return;
    const event = eventPack.events.find((row) => row.id === eventId);
    if (!event) return;
    const side = event.teamId === fixture?.homeTeamId ? attachment.homeShort : attachment.awayShort;
    const anchor = buildTapeAnchor(attachment.matchId, event, side);
    if (!anchor) {
      setNote('Pick a goal, card, or substitution.');
      return;
    }
    setPending(anchor);
    setEventOpen(false);
  }

  async function share() {
    if (!attachment) return;
    const takes = messages
      .filter((row) => row.tape?.matchId === attachment.matchId)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .slice(0, 3)
      .map((row) => ({
        author: app.users.find((user) => user.id === row.senderId)?.name ?? 'Fan',
        label: row.tape?.label ?? '',
        text: row.text,
        sample: row.tape ? isSampleAnchor(row.tape) : false,
      }));
    await sharePlainText(
      buildMatchTapeShareMessage({
        scoreline: scoreline || `${attachment.homeShort} vs ${attachment.awayShort}`,
        takes,
      }),
      'Match Tape',
    );
  }

  return {
    attachment,
    fixture,
    locked: tapeIsLocked(attachment),
    live,
    disclaimer: matchTapeDisclaimer(live),
    scoreline,
    headerLine,
    status,
    minute,
    pending,
    setPending,
    attachOpen,
    setAttachOpen,
    eventOpen,
    setEventOpen,
    query,
    setQuery,
    note,
    setNote,
    busy,
    listed,
    events: eventPack.events,
    sampleEvents: eventPack.sample,
    canAttach: !!target && !!threadKey && attachment?.status !== 'active',
    attach,
    archive,
    pickEvent,
    share,
  };
}

export type MatchTapeModel = ReturnType<typeof useMatchTapeThread>;
