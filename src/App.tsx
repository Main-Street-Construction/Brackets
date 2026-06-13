import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { TournamentFormat, Team, Match, TournamentRules, SetScore } from './types';
import {
  generateSingleElimination,
  generateDoubleElimination,
  generateRoundRobin,
  generateGroupStagePool,
  assignPoolGroupsInOrder,
  stripTeamGroups,
  generateCasualFirstRound,
  buildNextCasualRound,
  casualMaxRound,
  casualRoundIsComplete
} from './lib/tournament/generate';
import { assignNets, assignRoundRobinNets } from './lib/tournament/nets';
import {
  autoAdvanceByes,
  propagateWinnerToNext,
  propagateLoserToBracket
} from './lib/tournament/advance';
import { matchOutcomeFromSets } from './lib/tournament/scoring';
import { resolveDisplayChampion, isTournamentDecided } from './lib/tournament/champion';
import { TeamCalculator } from './components/TeamCalculator';
import { CourtScheduleView } from './components/CourtScheduleView';
import { EliminationCourtView } from './components/EliminationCourtView';
import { Trophy, Play, Plus, Trash2, LayoutGrid, GitMerge, Users, Share2, LogIn, ShieldCheck, Info, RefreshCw, CheckCircle, Home, ExternalLink, Copy } from 'lucide-react';
import { cn, stripUndefined } from './lib/utils';
import { db, auth, isFirebaseConfigured } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  updateDoc, 
  query, 
  where, 
  getDocs,
  deleteDoc,
  writeBatch,
  serverTimestamp 
} from 'firebase/firestore';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { consumeAuthRedirectError } from './authBootstrap';
import { signInWithGoogle } from './lib/googleSignIn';

import { WinnersListView } from './components/WinnersListView';
import { LiveFeed } from './components/LiveFeed';
import { FinishedTournamentView } from './components/FinishedTournamentView';
import { StatusBanner, type BannerMessage } from './components/StatusBanner';
import { validateBracketSeed } from './lib/validateBracket';
import { formatFirebaseError } from './lib/firebaseErrors';
import { matchToFirestore } from './lib/matchFirestore';
import { matchesNeedNetReconcile, reconcileMatchNets } from './lib/reconcileNets';
import { readLocalStorageJson, normalizeActiveNets, clearPersistedTournamentProgress, markTournamentPausedLocally } from './lib/persistence';
import { DEFAULT_RULES, sanitizeRules } from './lib/tournament/rules';
import { getChangedMatches, matchesSyncEqual, teamsSyncEqual } from './lib/matchSync';
import {
  advanceWinnersListAfterScore,
  applyWinnersListJoinQueue,
  buildWinnersListStartState,
  getLiveMatchOnNet,
  type WinnersListState
} from './lib/tournament/winnersList';

const DEFAULT_LOCAL_TEAMS: Team[] = [
  { id: '1', name: 'Team 1' },
  { id: '2', name: 'Team 2' },
  { id: '3', name: 'Team 3' },
  { id: '4', name: 'Team 4' }
];

const POINTS_OPTIONS = [25, 21, 15] as const;

async function deleteTournamentMatches(tid: string): Promise<void> {
  if (!db) return;
  const snapshot = await getDocs(collection(db, 'tournaments', tid, 'matches'));
  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += 500) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + 500)) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
}

function waitForListenerTeardown(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}

export default function App() {
  const savedCloudId =
    typeof window !== 'undefined' ? localStorage.getItem('tournament_id') : null;
  const isCloudSession = Boolean(savedCloudId);

  const [user, setUser] = useState<User | null>(null);
  const [tournamentId, setTournamentId] = useState<string | null>(() => savedCloudId);
  const [inviteCode, setInviteCode] = useState<string>('');
  const [joinCode, setJoinCode] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>(() =>
    isCloudSession
      ? []
      : readLocalStorageJson('tournament_teams', DEFAULT_LOCAL_TEAMS)
  );
  const [format, setFormat] = useState<TournamentFormat>(() => {
    if (isCloudSession) return 'single';
    const saved = localStorage.getItem('tournament_format');
    if (saved === 'play-twice') {
      localStorage.setItem('tournament_format', 'pool');
      localStorage.setItem('_migrated_play_twice', '1');
      return 'pool';
    }
    const allowed: TournamentFormat[] = ['single', 'double', 'pool', 'casual', 'winners-list'];
    if (saved && allowed.includes(saved as TournamentFormat)) {
      return saved as TournamentFormat;
    }
    return 'single';
  });
  const [matches, setMatches] = useState<Match[]>(() =>
    isCloudSession ? [] : readLocalStorageJson<Match[]>('tournament_matches', [])
  );
  const [isStarted, setIsStarted] = useState(() =>
    isCloudSession ? false : localStorage.getItem('tournament_isStarted') === 'true'
  );
  const [isFinished, setIsFinished] = useState(() =>
    isCloudSession ? false : localStorage.getItem('tournament_isFinished') === 'true'
  );
  const [isCreator, setIsCreator] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(isCloudSession);
  const [activeTab, setActiveTab] = useState<'tournaments' | 'winners-list'>(() => {
    if (isCloudSession) return 'tournaments';
    const saved = localStorage.getItem('tournament_activeTab');
    return saved === 'winners-list' ? 'winners-list' : 'tournaments';
  });
  const [numNets, setNumNets] = useState(() => {
    if (isCloudSession) return 1;
    const saved = localStorage.getItem('tournament_numNets');
    const n = saved ? parseInt(saved, 10) : 1;
    return Number.isFinite(n) && n > 0 ? n : 1;
  });
  const [queue, setQueue] = useState<string[]>(() =>
    isCloudSession ? [] : readLocalStorageJson<string[]>('tournament_queue', [])
  );
  const [activeNets, setActiveNets] = useState<{ [key: number]: string | null }>(() =>
    isCloudSession
      ? {}
      : normalizeActiveNets(readLocalStorageJson('tournament_activeNets', {}))
  );
  const [rules, setRules] = useState<TournamentRules>(() =>
    isCloudSession
      ? DEFAULT_RULES
      : sanitizeRules(readLocalStorageJson('tournament_rules', DEFAULT_RULES))
  );
  const [banner, setBanner] = useState<BannerMessage>(null);
  const reconcileKeyRef = useRef<string | null>(null);
  const suppressCloudSyncRef = useRef(false);
  /** Latest winners-list snapshot — updated synchronously so back-to-back scores see fresh state. */
  const winnersListSyncRef = useRef<WinnersListState>({ matches: [], queue: [], activeNets: {} });
  const scoringMatchesRef = useRef<Set<string>>(new Set());
  const teamNameTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const syncRef = useRef({ isCreator, isStarted, isFinished, format, numNets });
  syncRef.current = { isCreator, isStarted, isFinished, format, numNets };

  const markTournamentFinished = useCallback(() => {
    syncRef.current = { ...syncRef.current, isFinished: true };
    setIsFinished(true);
  }, []);

  const markTournamentOpen = useCallback(() => {
    syncRef.current = { ...syncRef.current, isFinished: false };
    setIsFinished(false);
  }, []);

  useEffect(() => {
    if (format !== 'winners-list') return;
    winnersListSyncRef.current = { matches, queue, activeNets };
  }, [format, matches, queue, activeNets]);

  useEffect(() => {
    const timers = teamNameTimersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  // Persistence for local mode — debounced so scoring doesn't block the main thread
  useEffect(() => {
    if (tournamentId) {
      localStorage.setItem('tournament_id', tournamentId);
      return;
    }
    const timer = window.setTimeout(() => {
      localStorage.removeItem('tournament_id');
      localStorage.setItem('tournament_teams', JSON.stringify(teams));
      localStorage.setItem('tournament_matches', JSON.stringify(matches));
      localStorage.setItem('tournament_queue', JSON.stringify(queue));
      localStorage.setItem('tournament_activeNets', JSON.stringify(activeNets));
      localStorage.setItem('tournament_format', format);
      localStorage.setItem('tournament_isStarted', String(isStarted));
      localStorage.setItem('tournament_isFinished', String(isFinished));
      localStorage.setItem('tournament_activeTab', activeTab);
      localStorage.setItem('tournament_numNets', String(numNets));
      localStorage.setItem('tournament_rules', JSON.stringify(rules));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [teams, matches, queue, activeNets, format, isStarted, isFinished, activeTab, numNets, rules, tournamentId]);

  useEffect(() => {
    if (tournamentId && !isFirebaseConfigured) {
      setTournamentId(null);
      localStorage.removeItem('tournament_id');
    }
  }, [tournamentId, isFirebaseConfigured]);

  useEffect(() => {
    if (localStorage.getItem('_migrated_play_twice') !== '1') return;
    localStorage.removeItem('_migrated_play_twice');
    setFormat('casual');
    setRules(prev => sanitizeRules({ ...prev, gamesPerTeam: Math.max(prev.gamesPerTeam ?? 2, 2) }));
  }, []);

  useEffect(() => {
    const msg = consumeAuthRedirectError();
    if (msg) setBanner({ type: 'error', message: msg });
  }, []);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  const login = async () => {
    if (!auth) {
      setBanner({
        type: 'info',
        message:
          'Cloud sign-in is not set up. Copy .env.example to .env and add your Firebase web app keys, then restart the dev server.'
      });
      return;
    }
    const r = await signInWithGoogle(auth);
    if (r.ok === false && r.message) {
      setBanner({ type: 'error', message: r.message });
    }
  };

  const logout = () => {
    if (auth) void signOut(auth);
  };

  // Sync Tournament
  useEffect(() => {
    if (!tournamentId || !db) return;

    const unsubTournament = onSnapshot(doc(db, 'tournaments', tournamentId), (snapshot) => {
      if (suppressCloudSyncRef.current) return;
      if (!snapshot.exists()) {
        setTournamentId(null);
        setMatches([]);
        setTeams([]);
        setQueue([]);
        setActiveNets({});
        setIsStarted(false);
        setIsFinished(false);
        setCloudSyncing(false);
        localStorage.removeItem('tournament_id');
        setBanner({ type: 'error', message: 'This tournament no longer exists.' });
        return;
      }
      const data = snapshot.data();
      const allowedFmt: TournamentFormat[] = ['single', 'double', 'pool', 'casual', 'winners-list'];
      const nextFormat = allowedFmt.includes(data.format as TournamentFormat)
        ? (data.format as TournamentFormat)
        : 'single';
      setFormat(prev => (prev === nextFormat ? prev : nextFormat));
      setIsStarted(prev => {
        const next = !!data.isStarted;
        return prev === next ? prev : next;
      });
      setIsFinished(prev => {
        const next = !!data.isFinished;
        return prev === next ? prev : next;
      });
      setRules(prev => {
        const next = sanitizeRules(data.rules as TournamentRules | undefined);
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
      setInviteCode(prev => {
        const next = data.inviteCode || '';
        return prev === next ? prev : next;
      });
      setIsCreator(prev => {
        const next = data.creatorId === user?.uid;
        return prev === next ? prev : next;
      });
      setNumNets(prev => {
        const next = typeof data.numNets === 'number' && data.numNets > 0 ? data.numNets : 1;
        return prev === next ? prev : next;
      });
      setQueue(prev => {
        const next = Array.isArray(data.queue) ? data.queue : [];
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
      setActiveNets(prev => {
        const next = normalizeActiveNets(data.activeNets);
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
      setCloudSyncing(false);
    }, err => {
      console.error('[Firestore] tournament subscription failed:', err);
      setCloudSyncing(false);
      setBanner({ type: 'error', message: formatFirebaseError(err) });
    });

    const unsubTeams = onSnapshot(
      collection(db, 'tournaments', tournamentId, 'teams'),
      snapshot => {
        if (suppressCloudSyncRef.current) return;
        const teamsData = snapshot.docs.map(d => {
          const data = d.data() as Team;
          return { ...data, id: data.id ?? d.id };
        });
        setTeams(prev => (teamsSyncEqual(prev, teamsData) ? prev : teamsData));
        setCloudSyncing(false);
      },
      err => {
        console.error('[Firestore] teams subscription failed:', err);
        setCloudSyncing(false);
        setBanner({ type: 'error', message: formatFirebaseError(err) });
      }
    );

    const unsubMatches = onSnapshot(
      collection(db, 'tournaments', tournamentId, 'matches'),
      snapshot => {
        if (suppressCloudSyncRef.current) return;
        if (syncRef.current.isFinished) return;
        let matchesData = snapshot.docs.map(d => {
          const data = d.data() as Match;
          return { ...data, id: data.id ?? d.id };
        });
        const { isCreator: creator, isStarted: started, isFinished: finished, format: fmt, numNets: nets } =
          syncRef.current;
        const reconcileKey = `${tournamentId}:${nets}:${fmt}`;
        if (
          creator &&
          started &&
          !finished &&
          fmt !== 'winners-list' &&
          matchesNeedNetReconcile(matchesData) &&
          reconcileKeyRef.current !== reconcileKey
        ) {
          reconcileKeyRef.current = reconcileKey;
          const before = matchesData;
          matchesData = reconcileMatchNets(matchesData, nets, fmt);
          const changed = getChangedMatches(matchesData, before);
          if (changed.length > 0) {
            void Promise.all(
              changed.map(m =>
                setDoc(
                  doc(db, 'tournaments', tournamentId, 'matches', m.id),
                  matchToFirestore(m)
                )
              )
            ).catch(err => {
              console.error('[Firestore] net reconcile failed:', err);
              reconcileKeyRef.current = null;
              setBanner({ type: 'error', message: formatFirebaseError(err) });
            });
          }
        }
        setMatches(prev => {
          if (syncRef.current.isFinished && matchesSyncEqual(prev, matchesData)) {
            return prev;
          }
          return matchesSyncEqual(prev, matchesData) ? prev : matchesData;
        });
        setCloudSyncing(false);
      },
      err => {
        console.error('[Firestore] matches subscription failed:', err);
        setCloudSyncing(false);
        setBanner({ type: 'error', message: formatFirebaseError(err) });
      }
    );

    return () => {
      unsubTournament();
      unsubTeams();
      unsubMatches();
    };
  }, [tournamentId, user?.uid]);

  const createTournament = async () => {
    if (!user || !db) {
      setBanner({
        type: 'error',
        message: user
          ? 'Cloud sync is not configured. Add VITE_FIREBASE_* to .env and restart.'
          : 'Sign in with Google to create a cloud tournament.'
      });
      return;
    }
    try {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const newTournamentRef = doc(collection(db, 'tournaments'));
      const id = newTournamentRef.id;

      await setDoc(newTournamentRef, {
        name: 'New Tournament',
        format,
        isStarted: false,
        isFinished: false,
        inviteCode: code,
        creatorId: user.uid,
        rules,
        numNets,
        queue: [],
        activeNets: {},
        createdAt: serverTimestamp()
      });

      for (const team of teams) {
        await setDoc(doc(db, 'tournaments', id, 'teams', team.id), { ...team, consecutiveWins: 0 });
      }

      setTournamentId(id);
      setInviteCode(code);
      setIsCreator(true);
      setCloudSyncing(true);
    } catch (err) {
      console.error('[createTournament] failed:', err);
      setBanner({ type: 'error', message: formatFirebaseError(err) });
    }
  };

  const joinTournament = async () => {
    if (!db) {
      setBanner({ type: 'error', message: 'Cloud sync is not configured.' });
      return;
    }
    try {
      const q = query(collection(db, 'tournaments'), where('inviteCode', '==', joinCode.toUpperCase()));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        setBanner({ type: 'error', message: 'Invalid invite code.' });
        return;
      }
      const d = snapshot.docs[0]!;
      const data = d.data();
      const id = d.id;
      if (user?.uid && data.creatorId === user.uid) {
        setTournamentId(id);
        setInviteCode(data.inviteCode || '');
        setCloudSyncing(true);
      } else {
        const url = `${window.location.origin}/live/${id}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('[joinTournament] failed:', err);
      setBanner({ type: 'error', message: formatFirebaseError(err) });
    }
  };

  const addTeam = async (name?: string) => {
    const newId = `team-${Date.now()}`;

    if (tournamentId && db) {
      try {
        const newTeam = { id: newId, name: name || `Team ${teams.length + 1}`, consecutiveWins: 0 };
        await setDoc(doc(db, 'tournaments', tournamentId, 'teams', newId), newTeam);
        if (format === 'winners-list') {
          await onJoinQueue(newId);
        }
      } catch (err) {
        console.error('[addTeam] failed:', err);
        setBanner({ type: 'error', message: formatFirebaseError(err) });
      }
    } else {
      setTeams(prev => {
        const newTeam = { id: newId, name: name || `Team ${prev.length + 1}`, consecutiveWins: 0 };
        const updated = [...prev, newTeam];
        if (format === 'winners-list') {
          void onJoinQueue(newId, updated);
        }
        return updated;
      });
    }
  };

  const removeTeam = async (id: string) => {
    try {
      if (tournamentId && db) {
        await deleteDoc(doc(db, 'tournaments', tournamentId, 'teams', id));
        if (queue.includes(id)) {
          const newQueue = queue.filter(tid => tid !== id);
          await updateDoc(doc(db, 'tournaments', tournamentId), { queue: newQueue });
        }
      } else {
        const updatedTeams = teams.filter(t => t.id !== id);
        setTeams(updatedTeams);
        if (queue.includes(id)) {
          setQueue(queue.filter(tid => tid !== id));
        }
      }
    } catch (err) {
      console.error('[removeTeam] failed:', err);
      setBanner({ type: 'error', message: formatFirebaseError(err) });
    }
  };

  const updateTeamName = async (id: string, name: string) => {
    setTeams(prev => prev.map(t => (t.id === id ? { ...t, name } : t)));
    if (tournamentId && db) {
      const timers = teamNameTimersRef.current;
      const prevTimer = timers.get(id);
      if (prevTimer) clearTimeout(prevTimer);
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          void updateDoc(doc(db, 'tournaments', tournamentId, 'teams', id), { name }).catch(err => {
            console.error('[updateTeamName] failed:', err);
            setBanner({ type: 'error', message: formatFirebaseError(err) });
          });
        }, 400)
      );
    }
  };

  const updateRules = async (newRules: Partial<TournamentRules>) => {
    const updated = sanitizeRules({ ...rules, ...newRules });
    setRules(updated);
    if (tournamentId && db) {
      try {
        await updateDoc(doc(db, 'tournaments', tournamentId), { rules: updated });
      } catch (err) {
        console.error('[updateRules] failed:', err);
        setBanner({ type: 'error', message: formatFirebaseError(err) });
      }
    }
  };

  const startTournament = async () => {
    try {
      if (teams.length < 2) {
        setBanner({ type: 'error', message: 'Add at least 2 teams before starting.' });
        return;
      }
      if (tournamentId && db && !isCreator) {
        setBanner({ type: 'error', message: 'Only the tournament creator can start the bracket.' });
        return;
      }

      let initialMatches: Match[] = [];

    if (format === 'single') {
      initialMatches = generateSingleElimination(teams);
      initialMatches = autoAdvanceByes(initialMatches);
      initialMatches = assignNets(initialMatches, numNets, 'single');
    } else if (format === 'double') {
      initialMatches = generateDoubleElimination(teams);
      initialMatches = autoAdvanceByes(initialMatches);
      initialMatches = assignNets(initialMatches, numNets, 'double');
    } else if (format === 'pool') {
      const ng = Math.min(12, Math.max(1, rules.poolGroups ?? 1));
      let poolTeams = teams;
      if (ng > 1) {
        poolTeams = assignPoolGroupsInOrder(teams, ng);
        setTeams(poolTeams);
        if (tournamentId && db) {
          for (const t of poolTeams) {
            await setDoc(doc(db, 'tournaments', tournamentId, 'teams', t.id), t);
          }
        }
      } else {
        poolTeams = stripTeamGroups(teams);
        setTeams(poolTeams);
        if (tournamentId && db) {
          for (const t of poolTeams) {
            await setDoc(doc(db, 'tournaments', tournamentId, 'teams', t.id), t);
          }
        }
      }
      initialMatches = generateGroupStagePool(poolTeams);
      initialMatches = assignRoundRobinNets(initialMatches, numNets);
    } else if (format === 'casual') {
      initialMatches = generateCasualFirstRound(teams);
      initialMatches = autoAdvanceByes(initialMatches);
      initialMatches = assignRoundRobinNets(initialMatches, numNets);
    } else if (format === 'winners-list') {
      const startState = buildWinnersListStartState(
        teams.map(t => t.id),
        numNets
      );
      initialMatches = startState.matches;
      const initialQueue = startState.queue;
      const initialActiveNets = startState.activeNets;

      if (tournamentId && db) {
        for (const team of teams) {
          await updateDoc(doc(db, 'tournaments', tournamentId, 'teams', team.id), { consecutiveWins: 0 });
        }

        for (const match of initialMatches) {
          await setDoc(
            doc(db, 'tournaments', tournamentId, 'matches', match.id),
            matchToFirestore(match)
          );
        }

        await updateDoc(doc(db, 'tournaments', tournamentId), { 
          isStarted: true, 
          isFinished: false,
          queue: initialQueue,
          activeNets: initialActiveNets
        });
        setMatches(initialMatches);
        setQueue(initialQueue);
        setActiveNets(initialActiveNets);
        setIsStarted(true);
        setIsFinished(false);
      } else {
        setMatches(initialMatches);
        setQueue(initialQueue);
        setActiveNets(initialActiveNets);
        setIsStarted(true);
        setIsFinished(false);
        setTeams(teams.map(t => ({ ...t, consecutiveWins: 0 })));
      }
      winnersListSyncRef.current = {
        matches: initialMatches,
        queue: initialQueue,
        activeNets: initialActiveNets
      };
      return;
    }

    validateBracketSeed(initialMatches, teams, format);

    if (tournamentId && db) {
      for (const match of initialMatches) {
        await setDoc(
          doc(db, 'tournaments', tournamentId, 'matches', match.id),
          matchToFirestore(match)
        );
      }
      await updateDoc(doc(db, 'tournaments', tournamentId), { isStarted: true, isFinished: false });
      setMatches(initialMatches);
      setIsStarted(true);
      setIsFinished(false);
    } else {
      setMatches(initialMatches);
      setIsStarted(true);
      setIsFinished(false);
    }
    } catch (err) {
      console.error('[startTournament] failed:', err);
      setBanner({ type: 'error', message: formatFirebaseError(err) });
    }
  };

  const abortTournament = async () => {
    if (!window.confirm('Are you sure you want to abort the tournament and return home? All progress will be lost.')) {
      return;
    }

    const tid = tournamentId;
    suppressCloudSyncRef.current = true;
    setIsStarted(false);
    setIsFinished(false);
    setMatches([]);
    setQueue([]);
    setActiveNets({});
    setTournamentId(null);
    setInviteCode('');
    setCloudSyncing(false);
    reconcileKeyRef.current = null;
    clearPersistedTournamentProgress();

    if (!tid || !db) {
      suppressCloudSyncRef.current = false;
      return;
    }

    try {
      await waitForListenerTeardown();
      await deleteTournamentMatches(tid);
      await updateDoc(doc(db, 'tournaments', tid), {
        isStarted: false,
        isFinished: false,
        queue: [],
        activeNets: {}
      });
    } catch (err) {
      console.error('[abortTournament] failed:', err);
      setBanner({ type: 'error', message: formatFirebaseError(err) });
    } finally {
      suppressCloudSyncRef.current = false;
    }
  };

  const endTournament = async () => {
    if (window.confirm("End the tournament? This will finalize the results.")) {
      try {
        if (tournamentId && db) {
          await updateDoc(doc(db, 'tournaments', tournamentId), { isFinished: true });
        }
        markTournamentFinished();
      } catch (err) {
        console.error('[endTournament] failed:', err);
        setBanner({ type: 'error', message: formatFirebaseError(err) });
      }
    }
  };

  const restartTournament = async () => {
    if (!window.confirm('Start over? This will clear all current scores and matches.')) return;

    const tid = tournamentId;
    suppressCloudSyncRef.current = true;
    setMatches([]);
    setQueue([]);
    setActiveNets({});
    setIsStarted(false);
    setIsFinished(false);
    reconcileKeyRef.current = null;

    try {
      if (tid && db) {
        await waitForListenerTeardown();
        await deleteTournamentMatches(tid);
        await updateDoc(doc(db, 'tournaments', tid), {
          isStarted: false,
          isFinished: false,
          queue: [],
          activeNets: {}
        });
      }
      suppressCloudSyncRef.current = false;
      await startTournament();
    } catch (err) {
      suppressCloudSyncRef.current = false;
      console.error('[restartTournament] failed:', err);
      setBanner({ type: 'error', message: formatFirebaseError(err) });
    }
  };

  const resetToSetup = async () => {
    if (!matches.length && !tournamentId && !isStarted && !isFinished) return;
    if (!window.confirm('Start a new tournament? This will clear current results.')) return;

    const tid = tournamentId;
    suppressCloudSyncRef.current = true;
    syncRef.current = { ...syncRef.current, isStarted: false, isFinished: false };
    setMatches([]);
    setQueue([]);
    setActiveNets({});
    setIsStarted(false);
    setIsFinished(false);
    setTournamentId(null);
    setInviteCode('');
    setCloudSyncing(false);
    reconcileKeyRef.current = null;
    winnersListSyncRef.current = { matches: [], queue: [], activeNets: {} };
    clearPersistedTournamentProgress();

    if (!tid || !db) {
      suppressCloudSyncRef.current = false;
      return;
    }

    void (async () => {
      try {
        await waitForListenerTeardown();
        await deleteTournamentMatches(tid);
        await updateDoc(doc(db, 'tournaments', tid), {
          isStarted: false,
          isFinished: false,
          queue: [],
          activeNets: {}
        });
      } catch (err) {
        console.error('[resetToSetup] failed:', err);
        setBanner({ type: 'error', message: formatFirebaseError(err) });
      } finally {
        suppressCloudSyncRef.current = false;
      }
    })();
  };

  const resumeTournament = async () => {
    setIsStarted(true);
    if (tournamentId && db) {
      try {
        await updateDoc(doc(db, 'tournaments', tournamentId), { isStarted: true });
      } catch (err) {
        console.error('[resumeTournament] failed:', err);
        setBanner({ type: 'error', message: formatFirebaseError(err) });
      }
    }
  };

  const onJoinQueue = async (teamId: string, _currentTeams?: Team[]) => {
    if (format !== 'winners-list') return;
    try {
        const { state, newMatches, updatedMatches } = applyWinnersListJoinQueue(
          winnersListSyncRef.current,
          teamId,
          numNets
        );
        winnersListSyncRef.current = state;
        setMatches(state.matches);
        setQueue(state.queue);
        setActiveNets(state.activeNets);

        if (tournamentId && db) {
          const updates: Record<string, unknown> = { queue: state.queue };
          for (const [net, matchId] of Object.entries(state.activeNets)) {
            updates[`activeNets.${net}`] = matchId;
          }
          await updateDoc(doc(db, 'tournaments', tournamentId), updates);
          for (const match of [...newMatches, ...updatedMatches]) {
            await setDoc(
              doc(db, 'tournaments', tournamentId, 'matches', match.id),
              matchToFirestore(match)
            );
          }
        }
        return;
    } catch (err) {
      console.error('[onJoinQueue] failed:', err);
      setBanner({ type: 'error', message: formatFirebaseError(err) });
    }
  };

  const onLeaveQueue = async (teamId: string) => {
    const newQueue = queue.filter(id => id !== teamId);
    try {
      if (tournamentId && db) {
        await updateDoc(doc(db, 'tournaments', tournamentId), { queue: newQueue });
      } else {
        setQueue(newQueue);
      }
    } catch (err) {
      console.error('[onLeaveQueue] failed:', err);
      setBanner({ type: 'error', message: formatFirebaseError(err) });
    }
  };

  const updateScore = useCallback(async (matchId: string, sets: SetScore[]) => {
    const outcome = matchOutcomeFromSets(sets, rules);
    if (!outcome.ok) return;

    if (scoringMatchesRef.current.has(matchId)) return;

    if (tournamentId && db && !isCreator) {
      setBanner({ type: 'error', message: 'Only the tournament creator can enter scores.' });
      return;
    }

    scoringMatchesRef.current.add(matchId);
    const baselineMatches = matches;

    try {

    const updatedMatches = [...matches];
    const matchIdx = updatedMatches.findIndex(m => m.id === matchId);
    if (matchIdx === -1) return;

    if (updatedMatches[matchIdx].winnerId) return;

    const winnerId = outcome.winnerIsTeam1
      ? updatedMatches[matchIdx].team1Id
      : updatedMatches[matchIdx].team2Id;
    const loserId = outcome.winnerIsTeam1
      ? updatedMatches[matchIdx].team2Id
      : updatedMatches[matchIdx].team1Id;

    const currentMatch: Match = {
      ...updatedMatches[matchIdx],
      sets,
      score1: outcome.setsWon1,
      score2: outcome.setsWon2,
      winnerId
    };

    updatedMatches[matchIdx] = currentMatch;

    let workingMatches = updatedMatches;
    if (format === 'casual' && winnerId) {
      const g = Math.max(1, Math.min(30, Math.floor(rules.gamesPerTeam ?? 2) || 2));
      const maxR = casualMaxRound(workingMatches);
      if (
        maxR >= 1 &&
        casualRoundIsComplete(workingMatches, maxR) &&
        maxR < g
      ) {
        const extra = buildNextCasualRound(teams, workingMatches, maxR + 1);
        if (extra.length > 0) {
          workingMatches = [...workingMatches, ...extra];
          workingMatches = autoAdvanceByes(workingMatches);
        }
      }
    }

    if (format === 'winners-list' && winnerId) {
      const snap = winnersListSyncRef.current;
      const liveBefore = snap.matches.find(m => m.id === matchId);
      if (!liveBefore || liveBefore.winnerId) return;

      const netIndex = currentMatch.netIndex!;
      const winnerTeam = teams.find(t => t.id === winnerId);
      const winnerConsecutiveWins = (winnerTeam?.consecutiveWins || 0) + 1;

      const { state, teamUpdates } = advanceWinnersListAfterScore(
        snap,
        matchId,
        currentMatch,
        rules,
        winnerConsecutiveWins,
        numNets
      );

      winnersListSyncRef.current = state;
      setMatches(state.matches);
      setQueue(state.queue);
      setActiveNets(state.activeNets);
      setTeams(prev =>
        prev.map(t => {
          const upd = teamUpdates.find(u => u.teamId === t.id);
          return upd ? { ...t, consecutiveWins: upd.consecutiveWins } : t;
        })
      );

      if (tournamentId && db) {
        void (async () => {
          try {
            await setDoc(
              doc(db, 'tournaments', tournamentId, 'matches', matchId),
              matchToFirestore(currentMatch)
            );
            const nextLive = getLiveMatchOnNet(state.matches, netIndex);
            if (nextLive && nextLive.id !== matchId) {
              await setDoc(
                doc(db, 'tournaments', tournamentId, 'matches', nextLive.id),
                matchToFirestore(nextLive)
              );
            }
            for (const upd of teamUpdates) {
              await updateDoc(doc(db, 'tournaments', tournamentId, 'teams', upd.teamId), {
                consecutiveWins: upd.consecutiveWins
              });
            }
            const updates: Record<string, unknown> = { queue: state.queue };
            for (const [net, mid] of Object.entries(state.activeNets)) {
              updates[`activeNets.${net}`] = mid;
            }
            await updateDoc(doc(db, 'tournaments', tournamentId), updates);
          } catch (err) {
            console.error('[Firestore] winners-list score save failed:', err);
            setBanner({ type: 'error', message: formatFirebaseError(err) });
          }
        })();
      }
      return;
    }

    let tournamentComplete = false;
    if (winnerId && format !== 'winners-list' && format !== 'pool' && format !== 'casual') {
      tournamentComplete = propagateWinnerToNext(
        workingMatches,
        currentMatch,
        matchId,
        winnerId
      ).tournamentComplete;
    }

    if (currentMatch.loserMatchId && loserId) {
      propagateLoserToBracket(workingMatches, currentMatch, matchId, loserId);
    }

    if (format === 'single' || format === 'double') {
      workingMatches = autoAdvanceByes(workingMatches);
    }

    const matchesWithNets =
      format === 'pool' || format === 'casual'
        ? assignRoundRobinNets(workingMatches, numNets)
        : assignNets(workingMatches, numNets, format);

    if (
      (format === 'pool' || format === 'casual') &&
      matchesWithNets.length > 0 &&
      matchesWithNets.every(m => m.winnerId)
    ) {
      tournamentComplete = true;
    }

    if (!tournamentComplete && isTournamentDecided(format, matchesWithNets)) {
      tournamentComplete = true;
    }

    const bracketStillDecided = isTournamentDecided(format, matchesWithNets);

    setMatches(matchesWithNets);
    if (tournamentComplete) {
      markTournamentFinished();
    } else if (isFinished && !bracketStillDecided) {
      markTournamentOpen();
    }

    if (tournamentId && db) {
      const changedOthers = getChangedMatches(matchesWithNets, baselineMatches).filter(
        m => m.id !== matchId
      );
      void (async () => {
        try {
          await setDoc(
            doc(db, 'tournaments', tournamentId, 'matches', matchId),
            matchToFirestore(currentMatch)
          );
          if (changedOthers.length > 0) {
            await Promise.all(
              changedOthers.map(m =>
                setDoc(doc(db, 'tournaments', tournamentId, 'matches', m.id), matchToFirestore(m))
              )
            );
          }
          if (tournamentComplete) {
            await updateDoc(doc(db, 'tournaments', tournamentId), { isFinished: true });
          } else if (isFinished && !bracketStillDecided) {
            await updateDoc(doc(db, 'tournaments', tournamentId), { isFinished: false });
          }
        } catch (err) {
          console.error('[Firestore] score save failed:', err);
          setBanner({ type: 'error', message: formatFirebaseError(err) });
        }
      })();
    }
    } finally {
      scoringMatchesRef.current.delete(matchId);
    }
  }, [
    matches,
    teams,
    format,
    rules,
    tournamentId,
    isCreator,
    isFinished,
    numNets,
    markTournamentFinished,
    markTournamentOpen
  ]);

  const finishTournament = async () => {
    if (window.confirm("Finish the tournament? This will finalize the results.")) {
      try {
        if (tournamentId && db) {
          await updateDoc(doc(db, 'tournaments', tournamentId), { isFinished: true });
        }
        markTournamentFinished();
      } catch (err) {
        console.error('[finishTournament] failed:', err);
        setBanner({ type: 'error', message: formatFirebaseError(err) });
      }
    }
  };

  const resetTournament = async () => {
    if (!window.confirm('Are you sure you want to reset the tournament? All scores will be lost.')) return;

    const tid = tournamentId;
    suppressCloudSyncRef.current = true;
    setIsStarted(false);
    setIsFinished(false);
    setMatches([]);
    setQueue([]);
    setActiveNets({});
    reconcileKeyRef.current = null;

    try {
      if (tid && db) {
        await waitForListenerTeardown();
        await deleteTournamentMatches(tid);
        await updateDoc(doc(db, 'tournaments', tid), {
          isStarted: false,
          isFinished: false,
          queue: [],
          activeNets: {}
        });
      }
    } catch (err) {
      console.error('[resetTournament] failed:', err);
      setBanner({ type: 'error', message: formatFirebaseError(err) });
    } finally {
      suppressCloudSyncRef.current = false;
    }
  };

  const exitToHome = useCallback(async () => {
    if (!isStarted) return;

    if (
      !isFinished &&
      !window.confirm(
        'Return to the home screen? Live scores stay saved unless you reset or abort.'
      )
    ) {
      return;
    }

    suppressCloudSyncRef.current = true;
    syncRef.current = { ...syncRef.current, isStarted: false };
    setIsStarted(false);
    if (!tournamentId) {
      markTournamentPausedLocally();
    }

    try {
      if (tournamentId && !isCreator) {
        setTournamentId(null);
        try {
          localStorage.removeItem('tournament_id');
        } catch {
          /* ignore */
        }
        return;
      }

      if (tournamentId && db && isCreator) {
        await updateDoc(doc(db, 'tournaments', tournamentId), { isStarted: false });
      }
    } catch (err) {
      console.error('[exitToHome] failed:', err);
      setBanner({ type: 'error', message: formatFirebaseError(err) });
    } finally {
      suppressCloudSyncRef.current = false;
    }
  }, [isStarted, isFinished, tournamentId, isCreator]);

  const displayChampion = useMemo(
    () => (isFinished ? resolveDisplayChampion(format, matches, teams) : null),
    [isFinished, format, matches, teams]
  );

  return (
    <div className="flex min-h-dvh flex-col bg-canvas px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-3">
      <div className="mx-auto flex w-full max-w-7xl min-h-0 flex-1 flex-col">
        <div className="w95-window">
          <header className="shrink-0">
            <div className="w95-titlebar">
              <div className="flex items-center gap-2 min-w-0">
                <Trophy className="h-4 w-4 shrink-0 opacity-90" />
                <span className="truncate text-xs sm:text-sm">Brackets</span>
              </div>
            </div>
            <div className="w95-toolbar flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {isStarted && (
                  <button
                    type="button"
                    onClick={() => void exitToHome()}
                    className="w95-btn flex items-center gap-1 text-xs font-semibold"
                  >
                    <Home className="h-3.5 w-3.5" />
                    Home
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1">
                {user ? (
                  <>
                    {isFirebaseConfigured && !tournamentId && !isStarted && (
                      <>
                        <input
                          type="text"
                          placeholder="Code"
                          value={joinCode}
                          onChange={(e) => setJoinCode(e.target.value)}
                          className="w95-input min-h-9 w-20 py-1 text-xs uppercase sm:w-32"
                        />
                        <button
                          type="button"
                          onClick={() => void joinTournament()}
                          className="w95-btn flex items-center gap-1 text-xs"
                          title="If you created this tournament, loads director view. Otherwise opens the public live board."
                        >
                          <LogIn className="h-3.5 w-3.5" />
                          Code
                        </button>
                      </>
                    )}
                    {tournamentId && (
                      <span className="w95-inset flex items-center gap-1 px-2 py-1 text-xs font-semibold text-ink">
                        <Share2 className="h-3.5 w-3.5" />
                        {inviteCode}
                      </span>
                    )}
                    {isStarted && (isCreator || !tournamentId) && (
                      <>
                        {!isFinished && (
                          <button
                            type="button"
                            onClick={finishTournament}
                            className="w95-btn flex items-center gap-1 text-xs"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Finish</span>
                      <span className="sm:hidden">Done</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={abortTournament}
                          className="w95-btn flex items-center gap-1 text-xs"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Abort</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void resetTournament()}
                          className="w95-btn flex items-center gap-1 text-xs"
                          title="Clear scores and return to setup for this cloud tournament"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Reset</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void resetToSetup()}
                          className="w95-btn flex items-center gap-1 text-xs"
                          title="Leave this tournament and start fresh (local or new cloud)"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">New</span>
                        </button>
                      </>
                    )}
                    <button type="button" onClick={logout} className="w95-btn text-xs">
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-xs font-semibold text-ink-secondary sm:hidden">
                      {isFirebaseConfigured ? 'Local' : 'Local only'}
                    </span>
                    {isFirebaseConfigured ? (
                      <button
                        type="button"
                        onClick={() => void login()}
                        className="w95-btn-default flex items-center gap-1 text-xs"
                      >
                        <LogIn className="h-3.5 w-3.5" />
                        Sign in
                      </button>
                    ) : (
                      <span className="w95-inset max-w-[10rem] truncate px-2 py-1 text-[10px] font-medium text-ink-secondary sm:max-w-none sm:text-xs">
                        Add Firebase in .env to enable sign-in
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-canvas px-2 py-3 sm:px-4 sm:py-4">
            {banner && (
              <div className="mb-4">
                <StatusBanner banner={banner} onDismiss={() => setBanner(null)} />
              </div>
            )}
            {cloudSyncing && tournamentId && (
              <div className="mb-4 rounded-lg border border-white/14 bg-surface px-3 py-2 text-center text-xs font-medium text-ink-secondary">
                Syncing tournament from cloud…
              </div>
            )}
        {!isStarted ? (
          <div className="space-y-6 sm:space-y-8">
            {/* Tab Switcher */}
            <div className="flex justify-center">
              <div className="w95-segment flex max-w-md w-full">
                <button
                  type="button"
                  data-active={activeTab === 'tournaments' ? 'true' : 'false'}
                  onClick={() => {
                    setActiveTab('tournaments');
                    if (format === 'winners-list') setFormat('single');
                  }}
                  className="flex items-center justify-center gap-2"
                >
                  <GitMerge className="w-4 h-4 shrink-0" />
                  Tournaments
                </button>
                <button
                  type="button"
                  data-active={activeTab === 'winners-list' ? 'true' : 'false'}
                  onClick={() => {
                    setActiveTab('winners-list');
                    setFormat('winners-list');
                  }}
                  className="flex items-center justify-center gap-2"
                >
                  <Users className="w-4 h-4 shrink-0" />
                  Winners List
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
            {/* Left Column: Team Management & Rules */}
            <div className="lg:col-span-2 space-y-6">
              {/* Rules Section */}
              <div className="w95-panel">
                <div className="w95-list-header mb-3 -mx-3 -mt-3 sm:-mx-4 sm:-mt-4 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  Tournament Rules
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <label className="block text-sm font-bold text-ink">Set Format</label>
                    <div className="flex flex-wrap gap-2">
                      {POINTS_OPTIONS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => updateRules({ pointsToWin: p })}
                          className={cn(
                            'rounded-lg border px-4 py-2 text-sm font-semibold transition-all',
                            rules.pointsToWin === p
                              ? 'chip-active border-accent/50 bg-accent/20 text-accent'
                              : 'chip border-white/14 bg-surface text-ink hover:border-white/24'
                          )}
                        >
                          First to {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="block text-sm font-bold text-ink">Match Length</label>
                    <div className="flex gap-2">
                      {[1, 3].map((b) => (
                        <button
                          key={b}
                          onClick={() => updateRules({ bestOf: b as any })}
                          className={cn(
                            "px-4 py-2 rounded-lg text-sm font-bold border transition-all",
                            rules.bestOf === b 
                              ? "chip-active border-accent/50 bg-accent/20 text-accent"
                              : "chip border-white/14 bg-surface text-ink hover:border-white/24"
                          )}
                        >
                          {b === 1 ? 'One Set' : 'Best of 3'}
                        </button>
                      ))}
                    </div>
                    {rules.bestOf === 3 && (
                      <p className="text-xs text-ink-secondary italic">Third set played to 15 points.</p>
                    )}
                  </div>

                  <div className="sm:col-span-2 pt-4 border-t border-white/8 flex flex-col sm:flex-row gap-6">
                    <button
                      onClick={() => updateRules({ winByTwo: !rules.winByTwo })}
                      className="flex items-center gap-3 group"
                    >
                      <div className={cn(
                        "w-12 h-6 rounded-full transition-all relative",
                        rules.winByTwo ? "bg-win shadow-inner ring-1 ring-win/40" : "bg-surface-overlay"
                      )}>
                        <div className={cn(
                          "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                          rules.winByTwo ? "left-7" : "left-1"
                        )} />
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-bold text-ink">Win by Two</div>
                        <div className="text-xs text-ink-secondary">Must win by at least 2 points.</div>
                      </div>
                    </button>

                    <div className="sm:col-span-2 flex flex-col gap-2 border-t border-white/8 pt-4 sm:flex-row sm:flex-wrap sm:items-center">
                      <span className="text-xs font-semibold text-ink">Serve to win</span>
                      <span className="hidden text-xs text-ink-secondary sm:inline">— honor on court; you still enter final scores.</span>
                      <div className="flex gap-0.5 rounded-md border border-white/12 bg-surface p-0.5">
                        <button
                          type="button"
                          onClick={() => updateRules({ serveToWin: true })}
                          className={cn(
                            'min-h-9 rounded px-3 py-1.5 text-[11px] font-bold transition-colors',
                            rules.serveToWin
                              ? 'bg-accent/25 text-accent'
                              : 'text-ink-secondary hover:bg-white/8 hover:text-ink'
                          )}
                        >
                          On
                        </button>
                        <button
                          type="button"
                          onClick={() => updateRules({ serveToWin: false })}
                          className={cn(
                            'min-h-9 rounded px-3 py-1.5 text-[11px] font-bold transition-colors',
                            !rules.serveToWin
                              ? 'bg-accent/25 text-accent'
                              : 'text-ink-secondary hover:bg-white/8 hover:text-ink'
                          )}
                        >
                          Off
                        </button>
                      </div>
                    </div>

                    {format === 'winners-list' && (
                      <div className="sm:col-span-2 space-y-3 pt-4 border-t border-white/8">
                        <label className="block text-sm font-bold text-ink">After each game</label>
                        <p className="text-xs text-ink-secondary">
                          Who stays on the court when a match ends?
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => updateRules({ winnerStays: true })}
                            className={cn(
                              'flex-1 rounded-lg border px-3 py-2.5 text-sm font-bold transition-all',
                              rules.winnerStays !== false
                                ? 'chip-active border-accent/50 bg-accent/20 text-accent'
                                : 'chip border-white/14 bg-surface text-ink hover:border-white/24'
                            )}
                          >
                            Winner stays
                          </button>
                          <button
                            type="button"
                            onClick={() => updateRules({ winnerStays: false })}
                            className={cn(
                              'flex-1 rounded-lg border px-3 py-2.5 text-sm font-bold transition-all',
                              rules.winnerStays === false
                                ? 'chip-active border-accent/50 bg-accent/20 text-accent'
                                : 'chip border-white/14 bg-surface text-ink hover:border-white/24'
                            )}
                          >
                            Both teams off
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="sm:col-span-2 pt-4 border-t border-white/8 space-y-4">
                      <label className="block text-sm font-bold text-ink">Number of Nets</label>
                      <div className="flex items-center gap-6">
                        <input
                          type="range"
                          min="1"
                          max="12"
                          value={numNets}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setNumNets(val);
                            if (tournamentId && db)
                              void updateDoc(doc(db, 'tournaments', tournamentId), { numNets: val });
                          }}
                          className="flex-1 accent-accent h-2 bg-surface-overlay rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="w-12 h-12 rounded-xl border border-white/14 bg-surface-overlay flex items-center justify-center text-lg font-bold text-ink">
                          {numNets}
                        </div>
                      </div>
                    </div>

                    {format === 'pool' && activeTab === 'tournaments' && (
                      <div className="panel-tint-win sm:col-span-2 space-y-3">
                        <label className="block text-sm font-bold text-win">Groups (World Cup style)</label>
                        <p className="text-xs leading-relaxed text-ink-secondary">
                          1 = one full pool. 2+ splits teams A, B, C… in list order; each group has its own round
                          robin. Nets fill group A before B, and so on.
                        </p>
                        <div className="flex items-center gap-6">
                          <input
                            type="range"
                            min="1"
                            max="12"
                            value={rules.poolGroups ?? 1}
                            onChange={e =>
                              updateRules({ poolGroups: parseInt(e.target.value, 10) })
                            }
                            className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-surface-overlay accent-win"
                          />
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-win/35 bg-surface-overlay text-lg font-bold text-ink">
                            {rules.poolGroups ?? 1}
                          </div>
                        </div>
                      </div>
                    )}

                    {format === 'casual' && activeTab === 'tournaments' && (
                      <div className="panel-tint-accent sm:col-span-2 space-y-3">
                        <label className="block text-sm font-bold text-accent">
                          Rounds (games per team)
                        </label>
                        <p className="text-xs leading-relaxed text-ink-secondary">
                          Everyone plays wave 1 first; the next wave unlocks after that round is fully done. Later
                          waves pair stronger records together when possible — low pressure, just for fun flow.
                        </p>
                        <div className="flex items-center gap-6">
                          <input
                            type="range"
                            min="1"
                            max="30"
                            value={rules.gamesPerTeam ?? 2}
                            onChange={e =>
                              updateRules({ gamesPerTeam: parseInt(e.target.value, 10) })
                            }
                            className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-surface-overlay accent-accent"
                          />
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-accent/35 bg-surface-overlay text-lg font-bold text-ink">
                            {rules.gamesPerTeam ?? 2}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="w95-panel">
                <div className="mb-6 flex flex-col gap-6 xl:flex-row xl:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <h2 className="flex items-center gap-2 text-lg font-semibold">
                        <Users className="h-5 w-5 text-accent" />
                        Teams ({teams.length})
                      </h2>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => addTeam()}
                          className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-900"
                        >
                          <Plus className="h-4 w-4" />
                          Add Team
                        </button>
                      </div>
                    </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {teams.map((team, index) => (
                      <div
                        key={team.id}
                        className="flex items-center gap-3 rounded-xl border border-white/12 bg-surface p-4 group active:bg-surface-overlay transition-colors"
                      >
                        <div className="flex flex-col items-center justify-center gap-0.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/14 bg-surface-overlay text-xs font-bold text-ink">
                            {index + 1}
                          </div>
                          {format === 'pool' && team.group && (
                            <span className="text-[9px] font-extrabold text-win">Grp {team.group}</span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={team.name}
                          onChange={(e) => updateTeamName(team.id, e.target.value)}
                          placeholder={`Team ${index + 1}`}
                          className="flex-1 bg-transparent border-none focus:ring-0 text-base font-semibold text-ink p-0 placeholder:text-ink-muted"
                        />
                        <button
                          onClick={() => removeTeam(team.id)}
                          className="min-h-11 min-w-11 p-2 text-ink-muted hover:text-live sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                          aria-label="Remove team"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                </div>
                  </div>
                  {activeTab === 'tournaments' && (
                    <div className="w-full shrink-0 xl:w-80">
                      <TeamCalculator embedded />
                    </div>
                  )}
                </div>
              </div>

              {activeTab === 'tournaments' && (
                <div className="w95-panel">
                  <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-ink">
                    <LayoutGrid className="w-5 h-5 text-accent" />
                    Tournament Style
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {[
                      { id: 'single', name: 'Single Elimination', icon: GitMerge, desc: 'Win or go home.' },
                      { id: 'double', name: 'Double Elimination', icon: GitMerge, desc: 'Two losses to be out.' },
                      {
                        id: 'pool',
                        name: 'Round robin',
                        icon: LayoutGrid,
                        desc: 'FIFA-style groups optional: round robin inside each group, then standings.'
                      },
                      {
                        id: 'casual',
                        name: 'Casual games',
                        icon: Users,
                        desc: 'X waves: finish a round before the next. Pairings nudge winners together — no official winner.'
                      }
                    ].map((style) => (
                      <button
                        key={style.id}
                        onClick={() => setFormat(style.id as TournamentFormat)}
                        className={cn(
                          "p-4 rounded-xl border-2 text-left transition-all",
                          format === style.id 
                            ? "border-accent/50 bg-accent/15 ring-2 ring-accent/30" 
                            : "border-white/12 bg-surface hover:border-white/20"
                        )}
                      >
                        <style.icon className={cn("w-6 h-6 mb-2", format === style.id ? "text-accent" : "text-ink-muted")} />
                        <div className="font-bold text-sm text-ink">{style.name}</div>
                        <div className="text-xs text-ink-secondary mt-1">{style.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Calculator & Start */}
            <div className="space-y-6">
              {!tournamentId && (
                <div className="w95-panel">
                  <h3 className="mb-2 flex items-center gap-2 font-bold text-ink">
                    <Share2 className="h-5 w-5 text-accent" />
                    Cloud sync (optional)
                  </h3>
                  {!isFirebaseConfigured ? (
                    <>
                      <p className="mb-4 text-sm text-ink-secondary">
                        Firebase is not configured in this build. Copy{' '}
                        <code className="rounded bg-surface px-1 py-0.5 text-xs text-ink">.env.example</code> to{' '}
                        <code className="rounded bg-surface px-1 py-0.5 text-xs text-ink">.env</code>, add your web
                        app keys from the Firebase console, enable Google sign-in and Firestore, then restart{' '}
                        <code className="rounded bg-surface px-1 py-0.5 text-xs text-ink">npm run dev</code>.
                      </p>
                      <p className="text-xs text-ink-secondary">
                        Until then, everything runs locally in this browser; data is still saved here when you are
                        not in a cloud tournament.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mb-6 text-sm text-ink-secondary">
                        Go live to share invite codes and sync scores across devices.
                      </p>
                      {!user ? (
                        <button
                          type="button"
                          onClick={() => void login()}
                          className="flex w-full min-h-11 items-center justify-center gap-2 rounded-lg border border-win/30 bg-win/10 py-3 font-bold text-win transition-colors hover:bg-win/15"
                        >
                          <LogIn className="h-4 w-4" />
                          Sign in to go live
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void createTournament()}
                          className="w-full rounded-lg bg-slate-800 py-3 font-bold text-white transition-colors hover:bg-slate-900"
                        >
                          Create cloud tournament
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {tournamentId && isFirebaseConfigured && isCreator && (
                <div className="panel-tint-accent p-5">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-accent">
                    <ExternalLink className="h-4 w-4" />
                    Public live results
                  </h3>
                  <p className="mb-3 text-xs leading-relaxed text-ink-secondary">
                    Share this link with players and fans. No Google sign-in — read-only courts, queue, bracket,
                    and scores.
                  </p>
                  <div className="mb-2 break-all rounded border border-white/14 bg-surface px-2 py-1.5 font-mono text-[11px] text-ink">
                    {typeof window !== 'undefined'
                      ? `${window.location.origin}/live/${tournamentId}`
                      : `/live/${tournamentId}`}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/live/${tournamentId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-ink hover:opacity-90"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open live
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        const u =
                          typeof window !== 'undefined'
                            ? `${window.location.origin}/live/${tournamentId}`
                            : '';
                        void navigator.clipboard.writeText(u).then(
                          () => setBanner({ type: 'info', message: 'Live link copied.' }),
                          () => setBanner({ type: 'error', message: 'Could not copy link.' })
                        );
                      }}
                      className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-white/14 bg-surface px-3 py-2 text-xs font-bold text-ink hover:bg-surface-overlay"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy link
                    </button>
                  </div>
                  {inviteCode && (
                    <p className="mt-3 text-[10px] font-semibold text-ink-secondary">
                      Short URL on your host:{' '}
                      <span className="font-mono">
                        {typeof window !== 'undefined' ? window.location.origin : ''}/live?code={inviteCode}
                      </span>
                    </p>
                  )}
                </div>
              )}

              {matches.length > 0 ? (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => void resumeTournament()}
                    className="flex w-full items-center justify-center gap-3 rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-900/20 transition-all hover:bg-emerald-700"
                  >
                    <Play className="w-6 h-6 fill-current" />
                    Resume {activeTab === 'tournaments' ? 'Tournament' : 'Open Play'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void restartTournament()}
                    disabled={!!tournamentId && !isCreator}
                    className="w-full min-h-11 border border-white/14 bg-surface py-3 rounded-xl font-bold text-sm text-ink hover:bg-surface-overlay transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Restart bracket
                  </button>
                  <button
                    type="button"
                    onClick={() => void resetToSetup()}
                    disabled={!!tournamentId && !isCreator}
                    className="w-full min-h-11 border border-white/14 bg-surface py-3 rounded-xl font-bold text-sm text-ink hover:bg-surface-overlay transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    New tournament
                  </button>
                </div>
              ) : (
                <button
                  onClick={startTournament}
                  disabled={teams.length < 2 || (tournamentId && !isCreator)}
                  className="flex w-full min-h-[3.25rem] cursor-pointer items-center justify-center gap-3 rounded-xl bg-accent py-4 text-base font-bold text-ink shadow-lg transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:text-lg"
                >
                  <Play className="w-6 h-6 fill-current" />
                  {tournamentId && !isCreator ? 'Waiting for Creator...' : activeTab === 'tournaments' ? 'Start Tournament' : 'Start Open Play'}
                </button>
              )}
              
              {!tournamentId && !user && (
                <p className="text-center text-xs text-ink-muted">
                  Running in Local Mode. Data is saved only on this device.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
          <div id="tournament-view">
            {isFinished ? (
              <>
                <div className="mb-6 rounded-xl border border-win/35 bg-win/10 px-4 py-6 text-center sm:py-8">
                  {format === 'casual' ? (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-widest text-win">
                        Session complete
                      </p>
                      <p className="mt-3 text-lg font-semibold text-ink">
                        All scheduled games are done. This format does not name a tournament winner.
                      </p>
                    </>
                  ) : format === 'pool' && displayChampion ? (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-widest text-win">
                        Pool play winner
                      </p>
                      <p className="mt-2 text-3xl font-bold leading-tight text-ink sm:text-4xl">
                        {displayChampion.name}
                      </p>
                      <p className="mt-2 text-sm text-ink-secondary">
                        Best record when all pool matches finished
                      </p>
                    </>
                  ) : displayChampion ? (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-widest text-win">
                        Tournament champion
                      </p>
                      <p className="mt-2 text-3xl font-bold leading-tight text-ink sm:text-4xl">
                        {displayChampion.name}
                      </p>
                      <p className="mt-2 text-sm font-medium text-ink-secondary">
                        First to {rules.pointsToWin}
                        {rules.bestOf === 3 ? ' · Best of 3' : ' · One set'}
                        {rules.winByTwo ? ' · Win by 2' : ''}
                        {rules.serveToWin ? ' · Serve to win' : ''}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-widest text-win">
                        Tournament complete
                      </p>
                      <p className="mt-3 text-lg font-semibold text-ink">
                        All matches finished — review standings for placement.
                      </p>
                    </>
                  )}
                </div>
                <FinishedTournamentView
                  format={format}
                  matches={matches}
                  teams={teams}
                  championId={displayChampion?.id}
                  onGoHome={() => void exitToHome()}
                  onNewTournament={() => void resetToSetup()}
                />
              </>
            ) : (
              <>
                <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <h1 className="mb-2 border-b border-white/8 pb-1 text-lg font-bold text-ink sm:text-xl">
                      Tournament live
                    </h1>
                    <div className="flex flex-wrap gap-2">
                      <div className="w95-inset flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-ink-secondary">
                        <Info className="h-4 w-4 shrink-0" />
                        <span>
                          First to {rules.pointsToWin}
                          {rules.bestOf === 3 && ' · Best of 3'}
                          {rules.winByTwo && ' · Win by 2'}
                        </span>
                      </div>
                      {rules.serveToWin && (
                        <div className="panel-tint-tie flex max-w-full items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-ink">
                          <Info className="h-3.5 w-3.5 shrink-0 text-tie" />
                          <span className="leading-snug">Serve to win on</span>
                        </div>
                      )}
                      {tournamentId && (
                        <div className="flex items-center gap-2 rounded-lg border border-white/14 bg-surface-overlay px-2 py-1.5 text-xs font-semibold uppercase text-ink">
                          <Share2 className="h-4 w-4" />
                          {inviteCode}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isCreator && (
                      <button
                        type="button"
                        onClick={endTournament}
                        className="w95-btn-default flex items-center gap-2 text-xs sm:text-sm"
                      >
                        <Trophy className="h-4 w-4" />
                        End tournament
                      </button>
                    )}
                  </div>
                </div>

                <LiveFeed matches={matches} teams={teams} />

                {format === 'winners-list' ? (
              <WinnersListView 
                matches={matches} 
                teams={teams} 
                queue={queue}
                numNets={numNets}
                onUpdateScore={updateScore}
                onJoinQueue={onJoinQueue}
                onLeaveQueue={onLeaveQueue}
                onAddTeam={addTeam}
                isCreator={isCreator}
                isFinished={false}
                rules={rules}
              />
            ) : format === 'pool' ? (
              <CourtScheduleView
                scheduleKind="round-robin"
                matches={matches}
                teams={teams}
                numNets={numNets}
                onUpdateScore={updateScore}
                isFinished={false}
                rules={rules}
              />
            ) : format === 'casual' ? (
              <CourtScheduleView
                scheduleKind="casual"
                targetGamesPerTeam={rules.gamesPerTeam ?? 2}
                queueHelpText="Finish the current wave on the nets before the next wave fills. Later pairings loosely group winners together — optional fun, not a strict bracket."
                matches={matches}
                teams={teams}
                numNets={numNets}
                onUpdateScore={updateScore}
                isFinished={false}
                rules={rules}
              />
            ) : format === 'single' ? (
              <EliminationCourtView
                variant="single"
                matches={matches}
                teams={teams}
                numNets={numNets}
                onUpdateScore={updateScore}
                isFinished={false}
                rules={rules}
              />
            ) : (
              <EliminationCourtView
                variant="double"
                matches={matches}
                teams={teams}
                numNets={numNets}
                onUpdateScore={updateScore}
                isFinished={false}
                rules={rules}
              />
            )}
              </>
            )}
          </div>
        )}
          </main>
          <footer className="w95-statusbar shrink-0">
            <span>
              {isStarted
                ? isFinished
                  ? 'Tournament finished'
                  : 'Tournament in progress'
                : 'Ready to set up'}
            </span>
            {!isFirebaseConfigured ? (
              <span>Firebase off — local only</span>
            ) : tournamentId ? (
              <span>Cloud sync</span>
            ) : (
              <span>Local only</span>
            )}
          </footer>
        </div>
      </div>
    </div>
  );
}
