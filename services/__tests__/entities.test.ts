import { seedFixtures } from '@/data/mocks/fixtures';
import { findPlayerByName, squadFor } from '@/data/mocks/players';
import { football } from '@/services/football';
import { describe, expect, it } from 'vitest';

describe('entity catalog', () => {
  it('exposes named squads for featured-league clubs', () => {
    for (const teamId of ['liv', 'ars', 'mci', 'rma', 'bar', 'int', 'bay', 'psg']) {
      const squad = football.getSquad(teamId);
      expect(squad.length).toBeGreaterThanOrEqual(11);
      expect(new Set(squad.map((p) => p.number)).size).toBe(squad.length);
      expect(football.getPlayer(squad[0]!.id)?.teamId).toBe(teamId);
    }
  });

  it('resolves every seeded match event to a player on that team', () => {
    for (const seed of seedFixtures) {
      for (const event of seed.events) {
        expect(findPlayerByName(event.teamId, event.playerName), `${event.playerName} @ ${event.teamId}`).toBeTruthy();
      }
    }
  });

  it('links featured scorers and starting XIs to player records', () => {
    const salah = findPlayerByName('liv', 'Salah');
    expect(salah?.id).toBe('p-liv-11');
    const scorers = football.getTopScorers('epl');
    expect(scorers.every((s) => s.playerId && football.getPlayer(s.playerId))).toBe(true);

    const fixture = football.getFixture('fx-liv-ars');
    expect(fixture).toBeTruthy();
    const lineups = football.getLineups(fixture!);
    expect(lineups.home.players).toHaveLength(11);
    expect(lineups.home.bench?.length).toBeGreaterThan(0);
    expect(lineups.home.players.every((p) => p.playerId && football.getPlayer(p.playerId))).toBe(true);
    expect(lineups.home.bench?.every((p) => p.playerId && football.getPlayer(p.playerId))).toBe(true);
    expect(lineups.away.players.every((p) => p.playerId && football.getPlayer(p.playerId))).toBe(true);
  });

  it('returns a rich mock season block for catalog clubs', () => {
    const liv = football.getTeamStats('liv');
    expect(liv?.venue).toBe('Anfield');
    expect(liv?.goalsForAverage?.total).toBeGreaterThan(0);
    expect(liv?.cleanSheets?.total).toBeGreaterThanOrEqual(0);
    expect(liv?.wins?.home).toEqual(expect.any(Number));
    expect(football.getTeamStats('mia')?.formation).toBeTruthy();
    expect(football.getTeamStats('missing')).toBeUndefined();
  });

  it('returns mock stats and appearances for a featured forward', () => {
    const stats = football.getPlayerStats('p-liv-11');
    expect(stats?.appearances).toBeGreaterThan(0);
    expect(stats?.goals).toBeGreaterThan(0);
    const apps = football.getPlayerAppearances('p-liv-11');
    expect(apps.length).toBeGreaterThan(0);
    expect(football.getFixture(apps[0]!.fixtureId)).toBeTruthy();
  });

  it('lists competitions and a generated squad for non-featured clubs', () => {
    expect(football.getTeamCompetitions('liv').some((l) => l.id === 'epl')).toBe(true);
    const mia = squadFor('mia');
    expect(mia).toHaveLength(16);
    expect(football.getPlayer(mia[0]!.id)?.name).toBe(mia[0]!.name);
  });

  it('lists catalog players including featured names', () => {
    const players = football.getPlayers();
    expect(players.some((p) => p.id === 'p-liv-11')).toBe(true);
    expect(players.length).toBeGreaterThan(200);
  });
});
