import type { MotmVote, ScorePrediction } from '../types';

function ago(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

function pred(
  matchId: string,
  userId: string,
  homeScore: number,
  awayScore: number,
  hoursAgo: number,
): ScorePrediction {
  const createdAt = ago(hoursAgo);
  return { matchId, userId, homeScore, awayScore, createdAt, updatedAt: createdAt };
}

function vote(
  matchId: string,
  userId: string,
  playerKey: string,
  playerName: string,
  teamId: string,
  hoursAgo: number,
  playerId?: string,
): MotmVote {
  return {
    matchId,
    userId,
    playerKey,
    playerId: playerId ?? playerKey,
    playerName,
    teamId,
    createdAt: ago(hoursAgo),
  };
}

/** Community picks from other demo fans. Maya is left empty so the default login can play. */
export const seedPredictions: ScorePrediction[] = [
  pred('fx-bha-mun', 'omar', 1, 1, 6),
  pred('fx-bha-mun', 'luca', 2, 1, 5),
  pred('fx-bha-mun', 'sophie', 1, 2, 4.5),
  pred('fx-bha-mun', 'jordan', 2, 0, 3),
  pred('fx-avl-whu', 'diego', 2, 0, 8),
  pred('fx-avl-whu', 'kenji', 1, 0, 7),
  pred('fx-liv-ars', 'omar', 1, 2, 14),
  pred('fx-liv-ars', 'luca', 2, 1, 12),
  pred('fx-liv-ars', 'sophie', 2, 2, 11),
  pred('fx-liv-ars', 'jordan', 3, 1, 10),
  pred('fx-liv-ars', 'aisha', 1, 1, 9),
  // Finished mock fixtures so the demo leaderboard has points without waiting on the clock.
  pred('fx-ful-eve', 'omar', 2, 1, 20),
  pred('fx-ful-eve', 'luca', 2, 0, 19),
  pred('fx-ful-eve', 'sophie', 1, 1, 18),
  pred('fx-ful-eve', 'jordan', 3, 1, 17),
  pred('fx-ful-eve', 'diego', 2, 1, 16),
  pred('fx-ful-eve', 'aisha', 1, 0, 15),
  pred('fx-ath-rso', 'omar', 1, 0, 30),
  pred('fx-ath-rso', 'luca', 0, 0, 29),
  pred('fx-ath-rso', 'kenji', 2, 0, 28),
  pred('fx-rom-ata', 'luca', 0, 1, 25),
  pred('fx-rom-ata', 'diego', 1, 1, 24),
];

export const seedMotmVotes: MotmVote[] = [
  vote('fx-liv-ars', 'jordan', 'p-liv-11', 'Mohamed Salah', 'liv', 0.4),
  vote('fx-liv-ars', 'omar', 'p-ars-7', 'Bukayo Saka', 'ars', 0.35),
  vote('fx-liv-ars', 'luca', 'p-liv-4', 'Virgil van Dijk', 'liv', 0.3),
  vote('fx-liv-ars', 'sophie', 'p-liv-11', 'Mohamed Salah', 'liv', 0.25),
  vote('fx-liv-ars', 'aisha', 'p-liv-10', 'Alexis Mac Allister', 'liv', 0.2),
  vote('fx-ful-eve', 'diego', 'p-ful-7', 'Raúl Jiménez', 'ful', 2),
  vote('fx-ful-eve', 'kenji', 'p-ful-17', 'Alex Iwobi', 'ful', 1.8),
  vote('fx-ful-eve', 'aisha', 'p-ful-7', 'Raúl Jiménez', 'ful', 1.6),
];
