import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import type { Match, Team, TournamentFormat, TournamentRules } from '../types';
import { cn } from '../lib/utils';
import { Radio, LayoutGrid, Trophy, Users, Clock, Home } from 'lucide-react';
import { BracketReferenceStrip } from '../components/EliminationCourtView';
import { matchIsOnNet, matchIsWaitingForCourt } from '../lib/matchSchedule';
import { resolveDisplayChampion } from '../lib/tournament/champion';

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
      .filter(m => m.winnerId)
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
    () => matches.filter(m => m.id.startsWith('w') || m.id.startsWith('l') || m.id.startsWith('gf-')),
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
      const wins = tm.filter(m => m.winnerId === team.id).length;
      const losses = tm.filter(m => m.winnerId && m.winnerId !== team.id).length;
      return { team, wins, losses, group: team.group ?? '' };
    });
    return rows.sort((a, b) => {
      if (showGrp && a.group !== b.group) return a.group.localeCompare(b.group);
      return b.wins - a.wins || a.team.name.localeCompare(b.team.name);
    });
  }, [matches, teams]);

  if (!isFirebaseConfigured || !db) {
    return (
      <div className="min-h-screen bg-zinc-100 p-6 text-center text-sm text-zinc-700">
        Live results need Firebase in <code className="rounded bg-white px-1">.env</code>.
        <div className="mt-4">
          <Link to="/" className="text-sky-700 underline">
            Director setup
          </Link>
        </div>
      </div>
    );
  }

  if (!tournamentId || missing) {
    return (
      <div className="min-h-screen bg-zinc-100 p-8 text-center">
        <p className="text-lg font-bold text-zinc-800">Tournament not found</p>
        <Link to="/" className="mt-4 inline-block text-sky-700 underline">
          <Home className="mb-1 inline h-4 w-4" /> Back home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#c0c0c0] text-black">
      <header className="border-b-4 border-t-4 border-white border-b-[#404040] bg-[#000080] px-4 py-3 text-white shadow-md">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">Live results</p>
            <h1 className="text-xl font-bold leading-tight">{name}</h1>
            <p className="text-xs text-white/90">{FORMAT_LABEL[format]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span
              className={cn(
                'rounded border px-2 py-1',
                isFinished ? 'border-emerald-300 bg-emerald-100 text-emerald-950' : 'border-white/40 bg-white/10'
              )}
            >
              {isFinished ? 'Finished' : isStarted ? 'In progress' : 'Not started'}
            </span>
            <span className="rounded border border-white/40 bg-white/10 px-2 py-1">
              First to {rules.pointsToWin}
              {rules.bestOf === 3 ? ' · Bo3' : ''}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-4 pb-12">
        {isFinished && (
          <section
            className="w95-panel border-4 border-[#000080] bg-gradient-to-b from-[#ffffcc] to-white p-5 text-center shadow-md"
            aria-live="polite"
          >
            <div className="mb-2 flex items-center justify-center gap-2 text-[#000080]">
              <Trophy className="h-8 w-8 shrink-0" aria-hidden />
              <span className="text-xs font-extrabold uppercase tracking-widest">Tournament champion</span>
            </div>
            {format === 'casual' ? (
              <p className="text-lg font-bold text-black">Session complete</p>
            ) : displayChampion ? (
              <p className="text-2xl font-extrabold tracking-tight text-black sm:text-3xl">{displayChampion.name}</p>
            ) : (
              <p className="text-lg font-bold text-zinc-700">Complete — see bracket for final placement</p>
            )}
            {displayChampion && format !== 'casual' && (
              <p className="mt-2 text-xs font-semibold text-zinc-600">
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
            <p className="text-xs font-bold text-black">
              Waiting for a net: <span className="text-[#000080]">{queue.length}</span> team
              {queue.length === 1 ? '' : 's'}
            </p>
            <div className="flex flex-wrap gap-2">
              {queue.slice(0, 24).map(id => (
                <span key={id} className="rounded border border-zinc-400 bg-white px-2 py-1 text-xs font-bold">
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
          <p className="text-xs font-semibold text-zinc-700">
            Next matches waiting for a court — be ready when your team appears.
          </p>
          {format === 'winners-list' && winnersQueuePairs.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-[10px] font-bold uppercase text-zinc-600">From waiting list (order)</p>
              <ol className="space-y-2">
                {winnersQueuePairs.slice(0, 15).map((p, i) => (
                  <li
                    key={`${p.a}-${p.b}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 border-2 border-dashed border-[#808080] bg-white px-3 py-2 text-sm font-bold"
                  >
                    <span className="text-[10px] font-extrabold text-[#000080]">#{i + 1}</span>
                    <span className="min-w-0 flex-1 text-center">
                      {teamName(p.a)}
                      <span className="mx-2 text-zinc-400">vs</span>
                      {teamName(p.b)}
                    </span>
                    <span className="text-[10px] text-zinc-500">Next wave</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {queuedMatches.length === 0 && !(format === 'winners-list' && winnersQueuePairs.length > 0) ? (
            <p className="text-sm font-bold text-zinc-500">No matches waiting (or all courts are full).</p>
          ) : (
            queuedMatches.length > 0 && (
            <ol className="space-y-2">
              {queuedMatches.slice(0, 20).map((m, i) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-2 border-dashed border-[#808080] bg-white px-3 py-2 text-sm font-bold"
                >
                  <span className="text-[10px] font-extrabold text-[#000080]">#{i + 1}</span>
                  <span className="min-w-0 flex-1 text-center">
                    {teamName(m.team1Id)}
                    <span className="mx-2 text-zinc-400">vs</span>
                    {teamName(m.team2Id)}
                  </span>
                  <span className="text-[10px] text-zinc-500">
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
                <div key={i} className="border-2 border-[#808080] bg-white p-3 shadow-sm">
                  <div className="mb-2 text-[10px] font-extrabold uppercase text-[#000080]">Net {i + 1}</div>
                  {m ? (
                    <div className="space-y-1 text-sm font-bold">
                      <div className={cn(m.winnerId === m.team1Id && 'text-emerald-800')}>
                        {teamName(m.team1Id)}
                      </div>
                      <div className={cn(m.winnerId === m.team2Id && 'text-emerald-800')}>
                        {teamName(m.team2Id)}
                      </div>
                      {m.sets && m.sets.length > 0 && (
                        <div className="pt-1 font-mono text-xs text-zinc-600">
                          {m.sets.map(s => `${s.team1}-${s.team2}`).join(' · ')}
                        </div>
                      )}
                      {m.winnerId && (
                        <div className="border-t border-emerald-200 pt-1 text-[10px] font-extrabold uppercase text-emerald-800">
                          Winner: {teamName(m.winnerId)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-zinc-400">Open</p>
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
                <tr className="border-b-2 border-[#808080]">
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
                  <tr key={row.team.id} className="border-t border-zinc-200">
                    {teams.some(t => Boolean(t.group)) && (
                      <td className="bg-white px-3 py-2 text-xs font-bold">{row.group || '—'}</td>
                    )}
                    <td className="bg-white px-3 py-2 font-bold">{row.team.name}</td>
                    <td className="bg-white px-3 py-2 text-center">{row.wins}</td>
                    <td className="bg-white px-3 py-2 text-center">{row.losses}</td>
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
              <div key={m.id} className="border border-zinc-300 bg-white px-3 py-2 text-xs">
                <div className="font-bold">
                  <span className={m.winnerId === m.team1Id ? 'text-emerald-800' : ''}>
                    {teamName(m.team1Id)}
                  </span>
                  <span className="mx-1 text-zinc-400">vs</span>
                  <span className={m.winnerId === m.team2Id ? 'text-emerald-800' : ''}>
                    {teamName(m.team2Id)}
                  </span>
                </div>
                {m.sets && m.sets.length > 0 && (
                  <div className="mt-1 font-mono text-[10px] text-zinc-600">
                    {m.sets.map(s => `${s.team1}-${s.team2}`).join(', ')}
                  </div>
                )}
                <div className="mt-1 font-extrabold text-emerald-800">W: {teamName(m.winnerId)}</div>
              </div>
            ))}
          </div>
          {recentDone.length === 0 && (
            <p className="text-xs font-semibold text-zinc-500">No finished matches yet.</p>
          )}
        </section>

        <p className="text-center text-[10px] text-zinc-600">
          Read-only feed · Scores come from the director’s console
        </p>
      </main>
    </div>
  );
}
