import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import type { Match, Team, TournamentFormat, TournamentRules } from '../types';
import { cn } from '../lib/utils';
import { Radio, LayoutGrid, Trophy, Users, Clock, Home } from 'lucide-react';
import { BracketReferenceStrip } from '../components/EliminationCourtView';
import { LiveFeed } from '../components/LiveFeed';
import { matchIsOnNet, matchIsWaitingForCourt, isAutoAdvancePlaceholder } from '../lib/matchSchedule';
import { resolveDisplayChampion } from '../lib/tournament/champion';
import { matchCountsTowardEliminationRecord } from '../lib/tournament/records';

const FORMAT_LABEL: Record<TournamentFormat, string> = {
  single: 'Single elimination',
  double: 'Double elimination',
  pool: 'Round robin (groups)',
  casual: 'Casual waves',
  'winners-list': 'Winners stay'
};

function defaultRules(): TournamentRules {
  return {
    pointsToWin: 25,
    bestOf: 3,
    thirdSetTo: 15,
    serveToWin: false,
    winByTwo: true,
    gamesPerTeam: 2,
    poolGroups: 1,
    winnerStays: true,
    maxConsecutiveWins: 3,
    onMaxWins: 'other-stays'
  };
}

export function LiveResultsView() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const [name, setName] = useState('Tournament');
  const [format, setFormat] = useState<TournamentFormat>('single');
  const [isStarted, setIsStarted] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [numNets, setNumNets] = useState(1);
  const [queue, setQueue] = useState<string[]>([]);
  const [activeNets, setActiveNets] = useState<Record<number, string | null>>({});
  const [rules, setRules] = useState<TournamentRules>(defaultRules);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!db || !tournamentId) {
      setMissing(true);
      return;
    }
    const tRef = doc(db, 'tournaments', tournamentId);
    const unsubT = onSnapshot(tRef, snap => {
      if (!snap.exists()) {
        setMissing(true);
        return;
      }
      setMissing(false);
      const d = snap.data();
      setName((d.name as string) || 'Tournament');
      const f = d.format as TournamentFormat;
      const ok: TournamentFormat[] = ['single', 'double', 'pool', 'casual', 'winners-list'];
      setFormat(ok.includes(f) ? f : 'single');
      setIsStarted(!!d.isStarted);
      setIsFinished(!!d.isFinished);
      setNumNets(typeof d.numNets === 'number' ? d.numNets : 1);
      setQueue(Array.isArray(d.queue) ? d.queue : []);
      setActiveNets((d.activeNets as Record<number, string | null>) || {});
      setRules({ ...defaultRules(), ...(d.rules as object) } as TournamentRules);
    });

    const unsubTeams = onSnapshot(collection(db, 'tournaments', tournamentId, 'teams'), snap => {
      setTeams(snap.docs.map(x => x.data() as Team));
    });
    const unsubMatches = onSnapshot(collection(db, 'tournaments', tournamentId, 'matches'), snap => {
      setMatches(snap.docs.map(x => x.data() as Match));
    });

    return () => {
      unsubT();
      unsubTeams();
      unsubMatches();
    };
  }, [tournamentId]);

  const teamName = (id: string | null | undefined) =>
    id ? teams.find(t => t.id === id)?.name ?? id.slice(0, 6) : '—';

  const elimOpponentLabel = (m: Match, side: 1 | 2) => {
    const id = side === 1 ? m.team1Id : m.team2Id;
    if (id) return teamName(id);
    return '—';
  };

  const winnersQueuePairs = useMemo(() => {
    if (format !== 'winners-list') return [];
    const pairs: { a: string; b: string }[] = [];
    for (let i = 0; i + 1 < queue.length; i += 2) {
      pairs.push({ a: queue[i]!, b: queue[i + 1]! });
    }
    return pairs;
  }, [format, queue]);

  const { queuedMatches, recentDone, onCourtByNet } = useMemo(() => {
    const active = matches
      .filter(m => matchIsOnNet(m) && !m.winnerId)
      .sort((a, b) => (a.netIndex ?? 0) - (b.netIndex ?? 0));
    const queued = matches
      .filter(m => matchIsWaitingForCourt(m))
      .sort((a, b) => {
        const ga = a.poolGroup ?? '';
        const gb = b.poolGroup ?? '';
        if (ga !== gb) return ga.localeCompare(gb);
        return (a.round ?? 0) - (b.round ?? 0) || a.id.localeCompare(b.id);
      });
    const done = matches
      .filter(m => m.winnerId && !isAutoAdvancePlaceholder(m))
      .sort((a, b) => b.id.localeCompare(a.id))
      .slice(0, 16);

    const byNet: Record<number, Match | undefined> = {};
    for (let i = 0; i < numNets; i++) {
      byNet[i] = active.find(m => m.netIndex === i);
    }
    return {
      queuedMatches: queued,
      recentDone: done,
      onCourtByNet: byNet
    };
  }, [matches, numNets]);

  const elimMatches = useMemo(
    () =>
      matches.filter(
        m =>
          (m.id.startsWith('w') || m.id.startsWith('l') || m.id.startsWith('gf-')) &&
          !isAutoAdvancePlaceholder(m)
      ),
    [matches]
  );

  const displayChampion = useMemo(() => {
    if (!isFinished) return null;
    return resolveDisplayChampion(format, matches, teams);
  }, [isFinished, format, matches, teams]);

  const poolStandings = useMemo(() => {
    const poolMs = matches.filter(m => m.id.startsWith('p-') || m.id.startsWith('c-'));
    if (poolMs.length === 0) return [];
    const showGrp = teams.some(t => Boolean(t.group));
    const rows = teams.map(team => {
      const tm = poolMs.filter(m => m.team1Id === team.id || m.team2Id === team.id);
      const rec = tm.filter(m => matchCountsTowardEliminationRecord(m));
      const wins = rec.filter(m => m.winnerId === team.id).length;
      const losses = rec.filter(m => m.winnerId && m.winnerId !== team.id).length;
      return { team, wins, losses, group: team.group ?? '' };
    });
    return rows.sort((a, b) => {
      if (showGrp && a.group !== b.group) return a.group.localeCompare(b.group);
      return b.wins - a.wins || a.team.name.localeCompare(b.team.name);
    });
  }, [matches, teams]);

  if (!isFirebaseConfigured || !db) {
    return (
      <div className="min-h-screen bg-canvas p-6 text-center text-sm text-ink-secondary">
        Live results need Firebase in <code className="rounded bg-surface-raised px-1">.env</code>.
        <div className="mt-4">
          <Link to="/" className="text-accent underline">
            Director setup
          </Link>
        </div>
      </div>
    );
  }

  if (!tournamentId || missing) {
    return (
      <div className="min-h-screen bg-canvas p-8 text-center">
        <p className="text-lg font-bold text-ink">Tournament not found</p>
        <Link to="/" className="mt-4 inline-block text-accent underline">
          <Home className="mb-1 inline h-4 w-4" /> Back home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="glass-panel border-b border-white/8 px-4 py-3">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Live results</p>
            <h1 className="text-xl font-bold leading-tight">{name}</h1>
            <p className="text-xs text-ink-secondary">{FORMAT_LABEL[format]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span
              className={cn(
                'rounded-full border px-2 py-1',
                isFinished ? 'border-win/30 bg-win/10 text-win' : 'border-white/10 bg-white/5 text-ink-secondary'
              )}
            >
              {isFinished ? 'Finished' : isStarted ? 'In progress' : 'Not started'}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-ink-secondary">
              First to {rules.pointsToWin}
              {rules.bestOf === 3 ? ' · Bo3' : ''}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-4 pb-12">
        {isStarted && <LiveFeed matches={matches} teams={teams} />}

        {isFinished && (
          <section
            className="w95-panel border border-win/30 bg-win/10 p-5 text-center"
            aria-live="polite"
          >
            <div className="mb-2 flex items-center justify-center gap-2 text-win">
              <Trophy className="h-8 w-8 shrink-0" aria-hidden />
              <span className="text-xs font-extrabold uppercase tracking-widest">Tournament champion</span>
            </div>
            {format === 'casual' ? (
              <p className="text-lg font-bold text-ink">Session complete</p>
            ) : displayChampion ? (
              <p className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{displayChampion.name}</p>
            ) : (
              <p className="text-lg font-bold text-ink-secondary">Complete — see bracket for final placement</p>
            )}
            {displayChampion && format !== 'casual' && (
              <p className="mt-2 text-xs font-semibold text-ink-muted">
                {FORMAT_LABEL[format]}
                {rules.bestOf === 3 ? ' · Best of 3 sets' : ' · Single set'}
              </p>
            )}
          </section>
        )}

        {format === 'winners-list' && (
          <section className="w95-panel space-y-3 p-4">
            <div className="w95-list-header -mx-4 -mt-4 mb-2 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Open play queue
            </div>
            <p className="text-xs font-bold text-ink-secondary">
              Waiting for a net: <span className="text-accent">{queue.length}</span> team
              {queue.length === 1 ? '' : 's'}
            </p>
            <div className="flex flex-wrap gap-2">
              {queue.slice(0, 24).map(id => (
                <span key={id} className="rounded-lg border border-white/10 bg-surface-raised px-2 py-1 text-xs font-bold text-ink">
                  {teamName(id)}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="w95-panel space-y-4 p-4">
          <div className="w95-list-header -mx-4 -mt-4 mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Who’s up next
          </div>
          <p className="text-xs font-semibold text-ink-secondary">
            Next matches waiting for a court — be ready when your team appears.
          </p>
          {format === 'winners-list' && winnersQueuePairs.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-[10px] font-bold uppercase text-ink-muted">From waiting list (order)</p>
              <ol className="space-y-2">
                {winnersQueuePairs.slice(0, 15).map((p, i) => (
                  <li
                    key={`${p.a}-${p.b}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-white/15 bg-surface-raised px-3 py-2 text-sm font-bold text-ink"
                  >
                    <span className="text-[10px] font-extrabold text-accent">#{i + 1}</span>
                    <span className="min-w-0 flex-1 text-center">
                      {teamName(p.a)}
                      <span className="mx-2 text-ink-muted">vs</span>
                      {teamName(p.b)}
                    </span>
                    <span className="text-[10px] text-ink-muted">Next wave</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {queuedMatches.length === 0 && !(format === 'winners-list' && winnersQueuePairs.length > 0) ? (
            <p className="text-sm font-bold text-ink-muted">No matches waiting (or all courts are full).</p>
          ) : (
            queuedMatches.length > 0 && (
            <ol className="space-y-2">
              {queuedMatches.slice(0, 20).map((m, i) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-white/15 bg-surface-raised px-3 py-2 text-sm font-bold text-ink"
                >
                  <span className="text-[10px] font-extrabold text-accent">#{i + 1}</span>
                  <span className="min-w-0 flex-1 text-center">
                    {elimOpponentLabel(m, 1)}
                    <span className="mx-2 text-ink-muted">vs</span>
                    {elimOpponentLabel(m, 2)}
                  </span>
                  <span className="text-[10px] text-ink-muted">
                    {m.poolGroup ? `Group ${m.poolGroup}` : ''}
                    {m.poolGroup && m.round > 0 ? ' · ' : ''}
                    {format === 'casual' ? `Round ${m.round}` : ''}
                  </span>
                </li>
              ))}
            </ol>
            )
          )}
        </section>

        <section className="w95-panel space-y-4 p-4">
          <div className="w95-list-header -mx-4 -mt-4 mb-2 flex items-center gap-2">
            <Radio className="h-4 w-4" />
            On court now
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: numNets }).map((_, i) => {
              const m = onCourtByNet[i];
              return (
                <div key={i} className="rounded-card border border-white/8 bg-surface-raised p-3">
                  <div className="mb-2 text-[10px] font-extrabold uppercase text-accent">Net {i + 1}</div>
                  {m ? (
                    <div className="space-y-1 text-sm font-bold text-ink">
                      <div className={cn(m.winnerId === m.team1Id && 'text-win')}>
                        {elimOpponentLabel(m, 1)}
                      </div>
                      <div className={cn(m.winnerId === m.team2Id && 'text-win')}>
                        {elimOpponentLabel(m, 2)}
                      </div>
                      {m.sets && m.sets.length > 0 && (
                        <div className="pt-1 font-mono text-xs text-ink-muted">
                          {m.sets.map(s => `${s.team1}-${s.team2}`).join(' · ')}
                        </div>
                      )}
                      {m.winnerId && (
                        <div className="border-t border-win/20 pt-1 text-[10px] font-extrabold uppercase text-win">
                          Winner: {teamName(m.winnerId)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-ink-muted">Open</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {(format === 'single' || format === 'double') && elimMatches.length > 0 && (
          <section className="w95-panel p-4">
            <BracketReferenceStrip
              matches={elimMatches}
              teams={teams}
              label={format === 'double' ? 'Bracket (reference)' : 'Bracket (reference)'}
            />
          </section>
        )}

        {(format === 'pool' || format === 'casual') && poolStandings.length > 0 && (
          <section className="w95-panel overflow-x-auto p-0">
            <div className="w95-list-header flex items-center gap-2">
              <LayoutGrid className="h-4 w-4" />
              {format === 'pool' ? 'Standings by group' : 'Activity'}
            </div>
            <table className="w-full min-w-[320px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  {teams.some(t => Boolean(t.group)) && (
                    <th className="w95-inset px-3 py-2 text-[10px] font-bold uppercase">Grp</th>
                  )}
                  <th className="w95-inset px-3 py-2 text-[10px] font-bold uppercase">Team</th>
                  <th className="w95-inset px-3 py-2 text-center text-[10px] font-bold uppercase">W</th>
                  <th className="w95-inset px-3 py-2 text-center text-[10px] font-bold uppercase">L</th>
                </tr>
              </thead>
              <tbody>
                {poolStandings.map(row => (
                  <tr key={row.team.id} className="border-t border-white/8">
                    {teams.some(t => Boolean(t.group)) && (
                      <td className="bg-surface-raised px-3 py-2 text-xs font-bold">{row.group || '—'}</td>
                    )}
                    <td className="bg-surface-raised px-3 py-2 font-bold">{row.team.name}</td>
                    <td className="bg-surface-raised px-3 py-2 text-center">{row.wins}</td>
                    <td className="bg-surface-raised px-3 py-2 text-center">{row.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="w95-panel space-y-3 p-4">
          <div className="w95-list-header -mx-4 -mt-4 mb-2 flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Recent results
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {recentDone.map(m => (
              <div key={m.id} className="rounded-lg border border-white/8 bg-surface-raised px-3 py-2 text-xs text-ink">
                <div className="font-bold">
                  <span className={m.winnerId === m.team1Id ? 'text-win' : ''}>
                    {elimOpponentLabel(m, 1)}
                  </span>
                  <span className="mx-1 text-ink-muted">vs</span>
                  <span className={m.winnerId === m.team2Id ? 'text-win' : ''}>
                    {elimOpponentLabel(m, 2)}
                  </span>
                </div>
                {m.sets && m.sets.length > 0 && (
                  <div className="mt-1 font-mono text-[10px] text-ink-muted">
                    {m.sets.map(s => `${s.team1}-${s.team2}`).join(', ')}
                  </div>
                )}
                <div className="mt-1 font-extrabold text-win">W: {teamName(m.winnerId)}</div>
              </div>
            ))}
          </div>
          {recentDone.length === 0 && (
            <p className="text-xs font-semibold text-ink-muted">No finished matches yet.</p>
          )}
        </section>

        <p className="text-center text-[10px] text-ink-muted">
          Read-only feed · Scores come from the director’s console
        </p>
      </main>
    </div>
  );
}
