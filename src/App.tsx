import React, { useState, useEffect, useMemo } from 'react';
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
import { resolveDisplayChampion } from './lib/tournament/champion';
import { TeamCalculator } from './components/TeamCalculator';
import { CourtScheduleView } from './components/CourtScheduleView';
import { EliminationCourtView } from './components/EliminationCourtView';
import { Trophy, Play, Plus, Trash2, LayoutGrid, GitMerge, Users, Share2, LogIn, ShieldCheck, Info, RefreshCw, CheckCircle, Home, ExternalLink, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
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
  serverTimestamp 
} from 'firebase/firestore';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { consumeAuthRedirectError } from './authBootstrap';
import { signInWithGoogle } from './lib/googleSignIn';

import { WinnersListView } from './components/WinnersListView';

const DEFAULT_RULES: TournamentRules = {
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

const POINTS_OPTIONS = [25, 21, 15] as const;

function sanitizeRules(r: TournamentRules | undefined | null): TournamentRules {
  const raw = { ...(r || {}) } as Partial<TournamentRules> & { playEachTimes?: unknown };
  delete raw.playEachTimes;
  const merged: TournamentRules = { ...DEFAULT_RULES, ...raw };
  const p = merged.pointsToWin;
  if (p !== 15 && p !== 21 && p !== 25) {
    merged.pointsToWin = 25;
  }
  let gpt = merged.gamesPerTeam ?? DEFAULT_RULES.gamesPerTeam ?? 2;
  if (typeof gpt !== 'number' || !Number.isFinite(gpt)) gpt = 2;
  gpt = Math.floor(gpt);
  if (gpt < 1) gpt = 1;
  if (gpt > 30) gpt = 30;
  merged.gamesPerTeam = gpt;
  let pg = merged.poolGroups ?? 1;
  if (typeof pg !== 'number' || !Number.isFinite(pg)) pg = 1;
  pg = Math.floor(pg);
  if (pg < 1) pg = 1;
  if (pg > 12) pg = 12;
  merged.poolGroups = pg;
  return merged;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tournamentId, setTournamentId] = useState<string | null>(() => {
    return localStorage.getItem('tournament_id');
  });
  const [inviteCode, setInviteCode] = useState<string>('');
  const [joinCode, setJoinCode] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>(() => {
    const saved = localStorage.getItem('tournament_teams');
    return saved ? JSON.parse(saved) : [
      { id: '1', name: 'Team 1' },
      { id: '2', name: 'Team 2' },
      { id: '3', name: 'Team 3' },
      { id: '4', name: 'Team 4' },
    ];
  });
  const [format, setFormat] = useState<TournamentFormat>(() => {
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
  const [matches, setMatches] = useState<Match[]>(() => {
    const saved = localStorage.getItem('tournament_matches');
    return saved ? JSON.parse(saved) : [];
  });
  const [isStarted, setIsStarted] = useState(() => {
    return localStorage.getItem('tournament_isStarted') === 'true';
  });
  const [isFinished, setIsFinished] = useState(() => {
    return localStorage.getItem('tournament_isFinished') === 'true';
  });
  const [isCreator, setIsCreator] = useState(false);
  const [activeTab, setActiveTab] = useState<'tournaments' | 'winners-list'>(() => {
    return (localStorage.getItem('tournament_activeTab') as any) || 'tournaments';
  });
  const [numNets, setNumNets] = useState(() => {
    const saved = localStorage.getItem('tournament_numNets');
    return saved ? parseInt(saved) : 1;
  });
  const [preSignupCount, setPreSignupCount] = useState(8);
  const [queue, setQueue] = useState<string[]>(() => {
    const saved = localStorage.getItem('tournament_queue');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeNets, setActiveNets] = useState<{ [key: number]: string | null }>(() => {
    const saved = localStorage.getItem('tournament_activeNets');
    return saved ? JSON.parse(saved) : {};
  });
  const [rules, setRules] = useState<TournamentRules>(() => {
    const saved = localStorage.getItem('tournament_rules');
    return saved ? sanitizeRules(JSON.parse(saved)) : DEFAULT_RULES;
  });

  // Persistence for local mode and tournamentId
  useEffect(() => {
    if (tournamentId) {
      localStorage.setItem('tournament_id', tournamentId);
      return;
    }
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
    if (msg) window.alert(msg);
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
      window.alert(
        'Cloud sign-in is not set up. Copy .env.example to .env and add your Firebase web app keys, then restart the dev server.'
      );
      return;
    }
    const r = await signInWithGoogle(auth);
    if (r.ok === false && r.message) {
      window.alert(r.message);
    }
  };

  const logout = () => {
    if (auth) void signOut(auth);
  };

  // Sync Tournament
  useEffect(() => {
    if (!tournamentId || !db) return;

    const unsubTournament = onSnapshot(doc(db, 'tournaments', tournamentId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const allowedFmt: TournamentFormat[] = ['single', 'double', 'pool', 'casual', 'winners-list'];
        setFormat(
          allowedFmt.includes(data.format as TournamentFormat)
            ? (data.format as TournamentFormat)
            : 'single'
        );
        setIsStarted(data.isStarted);
        setIsFinished(data.isFinished || false);
        setRules(sanitizeRules(data.rules as TournamentRules | undefined));
        setInviteCode(data.inviteCode);
        setIsCreator(data.creatorId === user?.uid);
        setNumNets(data.numNets || 1);
        setQueue(data.queue || []);
        setActiveNets(data.activeNets || {});
      }
    });

    const unsubTeams = onSnapshot(collection(db, 'tournaments', tournamentId, 'teams'), (snapshot) => {
      const teamsData = snapshot.docs.map(d => d.data() as Team);
      setTeams(teamsData.length > 0 ? teamsData : teams);
    });

    const unsubMatches = onSnapshot(collection(db, 'tournaments', tournamentId, 'matches'), (snapshot) => {
      const matchesData = snapshot.docs.map(d => d.data() as Match);
      setMatches(matchesData);
    });

    return () => {
      unsubTournament();
      unsubTeams();
      unsubMatches();
    };
  }, [tournamentId, user]);

  const createTournament = async () => {
    if (!user || !db) return;
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

    // Save initial teams
    for (const team of teams) {
      await setDoc(doc(db, 'tournaments', id, 'teams', team.id), { ...team, consecutiveWins: 0 });
    }

    setTournamentId(id);
    setInviteCode(code);
    setIsCreator(true);
  };

  const joinTournament = async () => {
    if (!db) {
      window.alert('Cloud sync is not configured.');
      return;
    }
    const q = query(collection(db, 'tournaments'), where('inviteCode', '==', joinCode.toUpperCase()));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      alert('Invalid invite code');
      return;
    }
    const d = snapshot.docs[0]!;
    const data = d.data();
    const id = d.id;
    if (user?.uid && data.creatorId === user.uid) {
      setTournamentId(id);
      setInviteCode(data.inviteCode || '');
    } else {
      const url = `${window.location.origin}/live/${id}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const addTeam = async (name?: string) => {
    console.log('Adding team:', name);
    const newId = `team-${Date.now()}`;
    
    if (tournamentId && db) {
      const newTeam = { id: newId, name: name || `Team ${teams.length + 1}`, consecutiveWins: 0 };
      await setDoc(doc(db, 'tournaments', tournamentId, 'teams', newId), newTeam);
      if (format === 'winners-list') {
        await onJoinQueue(newId);
      }
    } else {
      setTeams(prev => {
        const newTeam = { id: newId, name: name || `Team ${prev.length + 1}`, consecutiveWins: 0 };
        const updated = [...prev, newTeam];
        if (format === 'winners-list') {
          // Call onJoinQueue with the latest teams and queue
          onJoinQueue(newId, updated);
        }
        return updated;
      });
    }
  };

  const removeTeam = async (id: string) => {
    if (tournamentId && db) {
      await deleteDoc(doc(db, 'tournaments', tournamentId, 'teams', id));
      // If it's in the queue, remove it
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
  };

  const updateTeamName = async (id: string, name: string) => {
    if (tournamentId && db) {
      await updateDoc(doc(db, 'tournaments', tournamentId, 'teams', id), { name });
    } else {
      setTeams(teams.map(t => t.id === id ? { ...t, name } : t));
    }
  };

  const updateRules = async (newRules: Partial<TournamentRules>) => {
    const updated = sanitizeRules({ ...rules, ...newRules });
    setRules(updated);
    if (tournamentId && db) {
      await updateDoc(doc(db, 'tournaments', tournamentId), { rules: updated });
    }
  };

  const startTournament = async () => {
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
      let currentTeams = teams;
      if (teams.length === 0 && preSignupCount > 0) {
        currentTeams = Array.from({ length: preSignupCount }).map((_, i) => ({
          id: `team-${i + 1}`,
          name: `Team ${i + 1}`,
          consecutiveWins: 0
        }));
      }

      const initialQueue = currentTeams.map(t => t.id);
      const initialActiveNets: { [key: number]: string | null } = {};
      
      for (let i = 0; i < numNets; i++) {
        if (initialQueue.length >= 2) {
          const t1Id = initialQueue.shift()!;
          const t2Id = initialQueue.shift()!;
          const matchId = `net-${i}-${Date.now()}`;
          const match: Match = {
            id: matchId,
            team1Id: t1Id,
            team2Id: t2Id,
            round: 1,
            netIndex: i
          };
          initialMatches.push(match);
          initialActiveNets[i] = matchId;
        } else {
          initialActiveNets[i] = null;
        }
      }

      if (tournamentId && db) {
        // Save teams if they were generated
        if (teams.length === 0) {
          for (const team of currentTeams) {
            await setDoc(doc(db, 'tournaments', tournamentId, 'teams', team.id), team);
          }
        } else {
          // Reset consecutive wins for all teams
          for (const team of teams) {
            await updateDoc(doc(db, 'tournaments', tournamentId, 'teams', team.id), { consecutiveWins: 0 });
          }
        }

        await updateDoc(doc(db, 'tournaments', tournamentId), { 
          isStarted: true, 
          isFinished: false,
          queue: initialQueue,
          activeNets: initialActiveNets
        });
        for (const match of initialMatches) {
          await setDoc(doc(db, 'tournaments', tournamentId, 'matches', match.id), match);
        }
      } else {
        setMatches(initialMatches);
        setQueue(initialQueue);
        setActiveNets(initialActiveNets);
        setIsStarted(true);
        setIsFinished(false);
        setTeams(currentTeams.map(t => ({ ...t, consecutiveWins: 0 })));
      }
      return;
    }

    if (tournamentId && db) {
      await updateDoc(doc(db, 'tournaments', tournamentId), { isStarted: true, isFinished: false });
      for (const match of initialMatches) {
        await setDoc(doc(db, 'tournaments', tournamentId, 'matches', match.id), match);
      }
    } else {
      setMatches(initialMatches);
      setIsStarted(true);
      setIsFinished(false);
    }
  };

  const abortTournament = async () => {
    if (window.confirm("Are you sure you want to abort the tournament and return home? All progress will be lost.")) {
      if (tournamentId && db) {
        // Clear matches in Firestore
        const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');
        const snapshot = await getDocs(matchesRef);
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        
        await updateDoc(doc(db, 'tournaments', tournamentId), {
          isStarted: false,
          isFinished: false,
          queue: [],
          activeNets: {}
        });
      }
      setIsStarted(false);
      setIsFinished(false);
      setMatches([]);
      setQueue([]);
      setActiveNets({});
      setTournamentId(null);
    }
  };

  const endTournament = async () => {
    if (window.confirm("End the tournament? This will finalize the results.")) {
      if (tournamentId && db) {
        await updateDoc(doc(db, 'tournaments', tournamentId), { isFinished: true });
      } else {
        setIsFinished(true);
      }
    }
  };

  const restartTournament = async () => {
    if (window.confirm("Start over? This will clear all current scores and matches.")) {
      if (tournamentId && db) {
        // Clear matches in Firestore
        const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');
        const snapshot = await getDocs(matchesRef);
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        
        // Reset tournament state
        await updateDoc(doc(db, 'tournaments', tournamentId), {
          isStarted: false,
          isFinished: false,
          queue: [],
          activeNets: {}
        });
      }
      
      setMatches([]);
      setQueue([]);
      setActiveNets({});
      setIsStarted(false);
      setIsFinished(false);
      
      // Use a timeout to ensure state is cleared before starting again
      setTimeout(() => {
        startTournament();
      }, 200);
    }
  };

  const resetToSetup = async () => {
    if (window.confirm("Start a new tournament? This will clear current results.")) {
      if (tournamentId && db) {
        // Clear matches in Firestore
        const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');
        const snapshot = await getDocs(matchesRef);
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        
        // Reset tournament state
        await updateDoc(doc(db, 'tournaments', tournamentId), {
          isStarted: false,
          isFinished: false,
          queue: [],
          activeNets: {}
        });
      }
      
      setMatches([]);
      setQueue([]);
      setActiveNets({});
      setIsStarted(false);
      setIsFinished(false);
      setTournamentId(null);
      localStorage.removeItem('tournament_id');
    }
  };

  const onJoinQueue = async (teamId: string, currentTeams?: Team[]) => {
    console.log('Joining queue:', teamId);
    setQueue(prevQueue => {
      let newQueue = [...prevQueue, teamId];
      const newActiveNets = { ...activeNets };
      let updatedTeams = [...(currentTeams || teams)];
      let matchesToAdd: Match[] = [];

      if (format === 'winners-list') {
        // Check for empty nets or waiting matches
        for (let i = 0; i < numNets; i++) {
          const currentMatchId = newActiveNets[i];
          const currentMatch = matches.find(m => m.id === currentMatchId);

          // If net is empty OR match is finished, start a new one if we have 2 teams
          if ((!currentMatchId || currentMatch?.winnerId) && newQueue.length >= 2) {
            const t1Id = newQueue.shift()!;
            const t2Id = newQueue.shift()!;
            const matchId = `net-${i}-${Date.now()}`;
            const newMatch: Match = {
              id: matchId,
              team1Id: t1Id,
              team2Id: t2Id,
              round: 1,
              netIndex: i
            };
            newActiveNets[i] = matchId;
            matchesToAdd.push(newMatch);
            
            updatedTeams = updatedTeams.map(t => {
              if (t.id === t1Id || t.id === t2Id) return { ...t, consecutiveWins: 0 };
              return t;
            });
          } else if (currentMatch && !currentMatch.winnerId && !currentMatch.team2Id && newQueue.length >= 1) {
            // Fill waiting match (only if not finished)
            const t2Id = newQueue.shift()!;
            const updatedMatch = { ...currentMatch, team2Id: t2Id };
            matchesToAdd.push(updatedMatch);
            
            updatedTeams = updatedTeams.map(t => {
              if (t.id === t2Id) return { ...t, consecutiveWins: 0 };
              return t;
            });
          }
        }
      }

      if (tournamentId && db) {
        const updates: any = { queue: newQueue };
        if (format === 'winners-list') {
          for (const [net, matchId] of Object.entries(newActiveNets)) {
            updates[`activeNets.${net}`] = matchId;
          }
        }
        updateDoc(doc(db, 'tournaments', tournamentId), updates);
        for (const match of matchesToAdd) {
          setDoc(doc(db, 'tournaments', tournamentId, 'matches', match.id), match);
        }
        for (const team of updatedTeams) {
          if (matchesToAdd.some(m => m.team1Id === team.id || m.team2Id === team.id)) {
            updateDoc(doc(db, 'tournaments', tournamentId, 'teams', team.id), { consecutiveWins: 0 });
          }
        }
      } else {
        if (format === 'winners-list') {
          setActiveNets(newActiveNets);
          setMatches(prev => {
            const updated = [...prev];
            for (const m of matchesToAdd) {
              const idx = updated.findIndex(existing => existing.id === m.id);
              if (idx !== -1) {
                updated[idx] = m;
              } else {
                updated.push(m);
              }
            }
            return updated;
          });
          setTeams(updatedTeams);
        }
      }
      return newQueue;
    });
  };

  const onLeaveQueue = async (teamId: string) => {
    const newQueue = queue.filter(id => id !== teamId);
    if (tournamentId && db) {
      await updateDoc(doc(db, 'tournaments', tournamentId), { queue: newQueue });
    } else {
      setQueue(newQueue);
    }
  };

  const updateScore = async (matchId: string, sets: SetScore[]) => {
    const outcome = matchOutcomeFromSets(sets, rules);
    if (!outcome.ok) return;

    const updatedMatches = [...matches];
    const matchIdx = updatedMatches.findIndex(m => m.id === matchId);
    if (matchIdx === -1) return;

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

    if (format === 'winners-list' && winnerId && loserId) {
      const netIndex = currentMatch.netIndex!;
      const winnerTeam = teams.find(t => t.id === winnerId);
      
      const newQueue = [...queue]; // Loser is removed, doesn't auto-rejoin
      let nextTeam1Id = winnerId;
      let nextTeam2Id = null;

      // Update consecutive wins
      const updatedWinnerWins = (winnerTeam?.consecutiveWins || 0) + 1;
      const maxWins = rules.maxConsecutiveWins || 3;
      const reachedMax = updatedWinnerWins >= maxWins;

      if (!rules.winnerStays || (reachedMax && rules.onMaxWins === 'both-off')) {
        // Both off or winner doesn't stay - neither auto-rejoin
        if (newQueue.length >= 2) {
          nextTeam1Id = newQueue.shift()!;
          nextTeam2Id = newQueue.shift()!;
        } else {
          nextTeam1Id = null;
          nextTeam2Id = null;
        }
      } else if (reachedMax && rules.onMaxWins === 'other-stays') {
        // Winner off, loser stays - winner doesn't auto-rejoin
        if (newQueue.length > 0) {
          nextTeam1Id = loserId; // Other team stays
          nextTeam2Id = newQueue.shift()!;
        } else {
          nextTeam1Id = loserId;
          nextTeam2Id = null;
        }
      } else {
        // Winner stays, loser off - loser doesn't auto-rejoin
        if (newQueue.length > 0) {
          nextTeam2Id = newQueue.shift()!;
        }
      }

      if (nextTeam1Id) {
        const nextMatchId = `net-${netIndex}-${Date.now()}`;
        const nextMatch: Match = {
          id: nextMatchId,
          team1Id: nextTeam1Id,
          team2Id: nextTeam2Id,
          round: (currentMatch.round || 1) + 1,
          netIndex
        };
        
        if (tournamentId && db) {
          await setDoc(doc(db, 'tournaments', tournamentId, 'matches', matchId), currentMatch);
          await setDoc(doc(db, 'tournaments', tournamentId, 'matches', nextMatchId), nextMatch);
          // Reset wins if team is new or both off
          const t1Wins = nextTeam1Id === winnerId && !reachedMax ? updatedWinnerWins : 0;
          await updateDoc(doc(db, 'tournaments', tournamentId, 'teams', nextTeam1Id), { consecutiveWins: t1Wins });
          if (nextTeam2Id) {
            await updateDoc(doc(db, 'tournaments', tournamentId, 'teams', nextTeam2Id), { consecutiveWins: 0 });
          }
          await updateDoc(doc(db, 'tournaments', tournamentId, 'teams', loserId), { consecutiveWins: 0 });

          await updateDoc(doc(db, 'tournaments', tournamentId), { 
            queue: newQueue,
            [`activeNets.${netIndex}`]: nextMatchId 
          });
        } else {
          setMatches([...updatedMatches, nextMatch]);
          setQueue(newQueue);
          setActiveNets({ ...activeNets, [netIndex]: nextMatchId });
          setTeams(teams.map(t => {
            if (t.id === nextTeam1Id) return { ...t, consecutiveWins: nextTeam1Id === winnerId && !reachedMax ? updatedWinnerWins : 0 };
            if (nextTeam2Id && t.id === nextTeam2Id) return { ...t, consecutiveWins: 0 };
            if (t.id === loserId) return { ...t, consecutiveWins: 0 };
            return t;
          }));
        }
      } else {
        // Net becomes empty
        if (tournamentId && db) {
          await setDoc(doc(db, 'tournaments', tournamentId, 'matches', matchId), currentMatch);
          await updateDoc(doc(db, 'tournaments', tournamentId, 'teams', winnerId), { consecutiveWins: reachedMax ? 0 : updatedWinnerWins });
          await updateDoc(doc(db, 'tournaments', tournamentId, 'teams', loserId), { consecutiveWins: 0 });
          await updateDoc(doc(db, 'tournaments', tournamentId), { 
            queue: newQueue,
            [`activeNets.${netIndex}`]: null 
          });
        } else {
          setMatches(updatedMatches);
          setQueue(newQueue);
          setActiveNets({ ...activeNets, [netIndex]: null });
          setTeams(teams.map(t => {
            if (t.id === winnerId) return { ...t, consecutiveWins: reachedMax ? 0 : updatedWinnerWins };
            if (t.id === loserId) return { ...t, consecutiveWins: 0 };
            return t;
          }));
        }
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

    if (tournamentId && db) {
      await setDoc(doc(db, 'tournaments', tournamentId, 'matches', matchId), currentMatch);

      for (const m of matchesWithNets) {
        const originalMatch = matches.find(om => om.id === m.id);
        if (JSON.stringify(m) !== JSON.stringify(originalMatch)) {
          if (m.id !== matchId) {
            await setDoc(doc(db, 'tournaments', tournamentId, 'matches', m.id), m);
          }
        }
      }

      if (tournamentComplete) {
        await updateDoc(doc(db, 'tournaments', tournamentId), { isFinished: true });
      }
    } else {
      setMatches(matchesWithNets);
      if (tournamentComplete) {
        setIsFinished(true);
      }
    }
  };

  const finishTournament = async () => {
    if (window.confirm("Finish the tournament? This will finalize the results.")) {
      if (tournamentId && db) {
        await updateDoc(doc(db, 'tournaments', tournamentId), { isFinished: true });
      } else {
        setIsFinished(true);
      }
    }
  };

  const resetTournament = async () => {
    if (window.confirm("Are you sure you want to reset the tournament? All scores will be lost.")) {
      if (tournamentId && db) {
        // Clear matches in Firestore
        const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');
        const snapshot = await getDocs(matchesRef);
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        
        await updateDoc(doc(db, 'tournaments', tournamentId), {
          isStarted: false,
          isFinished: false,
          queue: [],
          activeNets: {}
        });
      }

      setIsStarted(false);
      setIsFinished(false);
      setMatches([]);
      setQueue([]);
      setActiveNets({});
    }
  };

  const exitToHome = async () => {
    if (!isStarted) {
      setIsStarted(false);
      return;
    }
    if (
      !window.confirm(
        'Return to the home screen? Live scores stay saved unless you reset or abort.'
      )
    ) {
      return;
    }
    if (tournamentId && !isCreator) {
      setTournamentId(null);
      localStorage.removeItem('tournament_id');
      setIsStarted(false);
      return;
    }
    if (tournamentId && db && isCreator) {
      await updateDoc(doc(db, 'tournaments', tournamentId), { isStarted: false });
    }
    setIsStarted(false);
  };

  const displayChampion = useMemo(
    () => (isFinished ? resolveDisplayChampion(format, matches, teams) : null),
    [isFinished, format, matches, teams]
  );

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-100 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-3">
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
                      <span className="w95-inset flex items-center gap-1 px-2 py-1 text-xs font-semibold text-zinc-800">
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
                    <span className="hidden text-xs font-semibold text-zinc-600 sm:inline">
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
                      <span className="w95-inset max-w-[10rem] truncate px-2 py-1 text-[10px] font-medium text-zinc-600 sm:max-w-none sm:text-xs">
                        Add Firebase in .env to enable sign-in
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-zinc-50/80 px-2 py-3 sm:px-4 sm:py-4">
        {!isStarted ? (
          <div className="space-y-8">
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
                    <label className="block text-sm font-bold text-zinc-700">Set Format</label>
                    <div className="flex flex-wrap gap-2">
                      {POINTS_OPTIONS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => updateRules({ pointsToWin: p })}
                          className={cn(
                            'rounded-lg border px-4 py-2 text-sm font-semibold transition-all',
                            rules.pointsToWin === p
                              ? 'border-slate-700 bg-slate-800 text-white'
                              : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                          )}
                        >
                          First to {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="block text-sm font-bold text-zinc-700">Match Length</label>
                    <div className="flex gap-2">
                      {[1, 3].map((b) => (
                        <button
                          key={b}
                          onClick={() => updateRules({ bestOf: b as any })}
                          className={cn(
                            "px-4 py-2 rounded-lg text-sm font-bold border transition-all",
                            rules.bestOf === b 
                              ? "border-slate-700 bg-slate-800 text-white" 
                              : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
                          )}
                        >
                          {b === 1 ? 'One Set' : 'Best of 3'}
                        </button>
                      ))}
                    </div>
                    {rules.bestOf === 3 && (
                      <p className="text-xs text-zinc-500 italic">Third set played to 15 points.</p>
                    )}
                  </div>

                  <div className="sm:col-span-2 pt-4 border-t border-zinc-100 flex flex-col sm:flex-row gap-6">
                    <button
                      onClick={() => updateRules({ winByTwo: !rules.winByTwo })}
                      className="flex items-center gap-3 group"
                    >
                      <div className={cn(
                        "w-12 h-6 rounded-full transition-all relative",
                        rules.winByTwo ? "bg-emerald-600 shadow-inner ring-1 ring-emerald-800/30" : "bg-zinc-300"
                      )}>
                        <div className={cn(
                          "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                          rules.winByTwo ? "left-7" : "left-1"
                        )} />
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-bold text-zinc-700">Win by Two</div>
                        <div className="text-xs text-zinc-500">Must win by at least 2 points.</div>
                      </div>
                    </button>

                    <div className="sm:col-span-2 flex flex-col gap-2 border-t border-zinc-100 pt-4 sm:flex-row sm:flex-wrap sm:items-center">
                      <span className="text-xs font-semibold text-zinc-700">Serve to win</span>
                      <span className="hidden text-xs text-zinc-500 sm:inline">— honor on court; you still enter final scores.</span>
                      <div className="flex gap-0.5 rounded-md border border-zinc-200 bg-zinc-50/80 p-0.5">
                        <button
                          type="button"
                          onClick={() => updateRules({ serveToWin: true })}
                          className={cn(
                            'rounded px-2.5 py-1 text-[11px] font-bold transition-colors',
                            rules.serveToWin
                              ? 'bg-slate-800 text-white'
                              : 'text-zinc-600 hover:bg-white'
                          )}
                        >
                          On
                        </button>
                        <button
                          type="button"
                          onClick={() => updateRules({ serveToWin: false })}
                          className={cn(
                            'rounded px-2.5 py-1 text-[11px] font-bold transition-colors',
                            !rules.serveToWin
                              ? 'bg-slate-800 text-white'
                              : 'text-zinc-600 hover:bg-white'
                          )}
                        >
                          Off
                        </button>
                      </div>
                    </div>

                    {format === 'winners-list' && (
                      <>
                        <button
                          onClick={() => updateRules({ winnerStays: !rules.winnerStays })}
                          className="flex items-center gap-3 group"
                        >
                          <div className={cn(
                            "w-12 h-6 rounded-full transition-all relative",
                            rules.winnerStays ? "bg-emerald-600 shadow-inner ring-1 ring-emerald-800/30" : "bg-zinc-300"
                          )}>
                            <div className={cn(
                              "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                              rules.winnerStays ? "left-7" : "left-1"
                            )} />
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-bold text-zinc-700">Winner Stays</div>
                            <div className="text-xs text-zinc-500">Winners stay on the net for next game.</div>
                          </div>
                        </button>

                        {rules.winnerStays && (
                          <div className="space-y-4 pt-4 border-t border-zinc-100">
                            <label className="block text-sm font-bold text-zinc-700">Max Consecutive Wins</label>
                            <div className="flex gap-2">
                              {[2, 3, 4, 5].map((w) => (
                                <button
                                  key={w}
                                  onClick={() => updateRules({ maxConsecutiveWins: w })}
                                  className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
                                    rules.maxConsecutiveWins === w 
                                      ? "border-slate-700 bg-slate-800 text-white" 
                                      : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
                                  )}
                                >
                                  {w} Wins
                                </button>
                              ))}
                            </div>
                            
                            <div className="space-y-2">
                              <label className="block text-[10px] font-bold text-zinc-400 uppercase">After Max Wins:</label>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => updateRules({ onMaxWins: 'other-stays' })}
                                  className={cn(
                                    "flex-1 px-3 py-2 rounded-lg text-[10px] font-bold border transition-all",
                                    rules.onMaxWins === 'other-stays' 
                                      ? "border-slate-700 bg-slate-800 text-white" 
                                      : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
                                  )}
                                >
                                  Other Team Stays
                                </button>
                                <button
                                  onClick={() => updateRules({ onMaxWins: 'both-off' })}
                                  className={cn(
                                    "flex-1 px-3 py-2 rounded-lg text-[10px] font-bold border transition-all",
                                    rules.onMaxWins === 'both-off' 
                                      ? "border-slate-700 bg-slate-800 text-white" 
                                      : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
                                  )}
                                >
                                  Both Teams Off
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    <div className="sm:col-span-2 pt-4 border-t border-zinc-100 space-y-4">
                      <label className="block text-sm font-bold text-zinc-700">Number of Nets</label>
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
                          className="flex-1 accent-slate-700 h-2 bg-zinc-100 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="w-12 h-12 rounded-xl border border-slate-600/40 bg-slate-100 flex items-center justify-center text-lg font-bold text-slate-800">
                          {numNets}
                        </div>
                      </div>
                    </div>

                    {format === 'pool' && activeTab === 'tournaments' && (
                      <div className="sm:col-span-2 space-y-3 rounded-xl border-2 border-emerald-200 bg-emerald-50/50 p-4">
                        <label className="block text-sm font-bold text-emerald-950">Groups (World Cup style)</label>
                        <p className="text-xs leading-relaxed text-emerald-900/90">
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
                            className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-zinc-100 accent-emerald-700"
                          />
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-600/40 bg-white text-lg font-bold text-emerald-950">
                            {rules.poolGroups ?? 1}
                          </div>
                        </div>
                      </div>
                    )}

                    {format === 'casual' && activeTab === 'tournaments' && (
                      <div className="sm:col-span-2 space-y-3 rounded-xl border-2 border-sky-200 bg-sky-50/60 p-4">
                        <label className="block text-sm font-bold text-sky-950">
                          Rounds (games per team)
                        </label>
                        <p className="text-xs leading-relaxed text-sky-900/90">
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
                            className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-zinc-100 accent-sky-700"
                          />
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-sky-600/40 bg-white text-lg font-bold text-sky-950">
                            {rules.gamesPerTeam ?? 2}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {format === 'winners-list' && (
                    <div className="sm:col-span-2 pt-4 border-t border-zinc-100 space-y-6">
                      <div className="space-y-4">
                        <label className="block text-sm font-bold text-zinc-700">Pre-sign up Teams</label>
                        <div className="flex items-center gap-6">
                          <input
                            type="range"
                            min="2"
                            max="48"
                            value={preSignupCount}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              setPreSignupCount(val);
                            }}
                            className="flex-1 accent-slate-700 h-2 bg-zinc-100 rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="w-12 h-12 rounded-xl border border-slate-600/40 bg-slate-100 flex items-center justify-center text-lg font-bold text-slate-800">
                            {preSignupCount}
                          </div>
                        </div>
                        <p className="text-[10px] text-zinc-500 italic">Automatically generates placeholder teams to start the queue.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex flex-col gap-6 xl:flex-row xl:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <h2 className="flex items-center gap-2 text-lg font-semibold">
                        <Users className="h-5 w-5 text-slate-700" />
                        Teams ({teams.length})
                      </h2>
                      <div className="flex flex-wrap gap-2">
                        {activeTab === 'winners-list' && (
                          <button
                            onClick={() => {
                              const newTeams = Array.from({ length: preSignupCount }).map((_, i) => ({
                                id: `team-${Date.now()}-${i}`,
                                name: `Team ${teams.length + i + 1}`,
                                consecutiveWins: 0
                              }));
                              setTeams([...teams, ...newTeams]);
                            }}
                            className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-950 transition-colors hover:bg-emerald-100"
                          >
                            <Plus className="h-4 w-4" />
                            Quick Add {preSignupCount}
                          </button>
                        )}
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
                  <AnimatePresence mode="popLayout">
                    {teams.map((team, index) => (
                      <motion.div
                        key={team.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="flex items-center gap-3 p-4 bg-zinc-50 rounded-xl border border-zinc-200 group active:bg-zinc-100 transition-colors"
                      >
                        <div className="flex flex-col items-center justify-center gap-0.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-xs font-bold text-zinc-500 shadow-sm">
                            {index + 1}
                          </div>
                          {format === 'pool' && team.group && (
                            <span className="text-[9px] font-extrabold text-emerald-800">Grp {team.group}</span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={team.name}
                          onChange={(e) => updateTeamName(team.id, e.target.value)}
                          placeholder={`Team ${index + 1}`}
                          className="flex-1 bg-transparent border-none focus:ring-0 text-base font-semibold p-0 placeholder:text-zinc-400"
                        />
                        <button
                          onClick={() => removeTeam(team.id)}
                          className="p-2 text-zinc-400 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                          aria-label="Remove team"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
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
                <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
                  <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <LayoutGrid className="w-5 h-5 text-slate-700" />
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
                            ? "border-slate-600 bg-emerald-50 ring-4 ring-emerald-200/60" 
                            : "border-zinc-100 hover:border-zinc-200 bg-white"
                        )}
                      >
                        <style.icon className={cn("w-6 h-6 mb-2", format === style.id ? "text-slate-700" : "text-zinc-400")} />
                        <div className="font-bold text-sm">{style.name}</div>
                        <div className="text-xs text-zinc-500 mt-1">{style.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Calculator & Start */}
            <div className="space-y-6">
              {!tournamentId && (
                <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-2 flex items-center gap-2 font-bold text-zinc-900">
                    <Share2 className="h-5 w-5 text-slate-700" />
                    Cloud sync (optional)
                  </h3>
                  {!isFirebaseConfigured ? (
                    <>
                      <p className="mb-4 text-sm text-zinc-600">
                        Firebase is not configured in this build. Copy{' '}
                        <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">.env.example</code> to{' '}
                        <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">.env</code>, add your web
                        app keys from the Firebase console, enable Google sign-in and Firestore, then restart{' '}
                        <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">npm run dev</code>.
                      </p>
                      <p className="text-xs text-zinc-500">
                        Until then, everything runs locally in this browser; data is still saved here when you are
                        not in a cloud tournament.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mb-6 text-sm text-zinc-500">
                        Go live to share invite codes and sync scores across devices.
                      </p>
                      {!user ? (
                        <button
                          type="button"
                          onClick={() => void login()}
                          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-50 py-3 font-bold text-emerald-950 transition-colors hover:bg-emerald-100"
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
                <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-5 shadow-sm">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-sky-950">
                    <ExternalLink className="h-4 w-4" />
                    Public live results
                  </h3>
                  <p className="mb-3 text-xs leading-relaxed text-sky-900/90">
                    Share this link with players and fans. No Google sign-in — read-only courts, queue, bracket,
                    and scores.
                  </p>
                  <div className="mb-2 break-all rounded border border-sky-300/60 bg-white px-2 py-1.5 font-mono text-[11px] text-sky-950">
                    {typeof window !== 'undefined'
                      ? `${window.location.origin}/live/${tournamentId}`
                      : `/live/${tournamentId}`}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/live/${tournamentId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-sky-800 px-3 py-2 text-xs font-bold text-white hover:bg-sky-900"
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
                        void navigator.clipboard.writeText(u).then(() => {});
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-sky-600 bg-white px-3 py-2 text-xs font-bold text-sky-950 hover:bg-sky-100"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy link
                    </button>
                  </div>
                  {inviteCode && (
                    <p className="mt-3 text-[10px] font-semibold text-sky-900/80">
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
                    onClick={() => setIsStarted(true)}
                    className="flex w-full items-center justify-center gap-3 rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-900/20 transition-all hover:bg-emerald-700"
                  >
                    <Play className="w-6 h-6 fill-current" />
                    Resume {activeTab === 'tournaments' ? 'Tournament' : 'Open Play'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void restartTournament()}
                    disabled={!!tournamentId && !isCreator}
                    className="w-full bg-white py-3 rounded-xl font-bold text-sm border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Restart bracket
                  </button>
                  <button
                    type="button"
                    onClick={() => void resetToSetup()}
                    disabled={!!tournamentId && !isCreator}
                    className="w-full bg-white py-3 rounded-xl font-bold text-sm border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    New tournament
                  </button>
                </div>
              ) : (
                <button
                  onClick={startTournament}
                  disabled={(activeTab === 'tournaments' && teams.length < 2) || (activeTab === 'winners-list' && preSignupCount < 2) || (tournamentId && !isCreator)}
                  className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl bg-slate-800 py-4 text-lg font-bold text-white shadow-lg shadow-slate-900/25 transition-all hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="w-6 h-6 fill-current" />
                  {tournamentId && !isCreator ? 'Waiting for Creator...' : activeTab === 'tournaments' ? 'Start Tournament' : 'Start Open Play'}
                </button>
              )}
              
              {!tournamentId && !user && (
                <p className="text-center text-xs text-zinc-400">
                  Running in Local Mode. Data is saved only on this device.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
          <div id="tournament-view">
            {isFinished && (
              <div className="mb-6 rounded-xl border-2 border-emerald-400/80 bg-emerald-50 px-4 py-6 text-center shadow-sm sm:py-8">
                {format === 'casual' ? (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-900/80">
                      Session complete
                    </p>
                    <p className="mt-3 text-lg font-semibold text-emerald-950">
                      All scheduled games are done. This format does not name a tournament winner.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-900/80">
                      Tournament winner
                    </p>
                    {displayChampion ? (
                      <>
                        <p className="mt-2 text-3xl font-bold leading-tight text-emerald-950 sm:text-4xl">
                          {displayChampion.name}
                        </p>
                        <p className="mt-2 text-sm font-medium text-emerald-900/90">
                          First to {rules.pointsToWin}
                          {rules.bestOf === 3 ? ' · Best of 3' : ' · One set'}
                          {rules.winByTwo ? ' · Win by 2' : ''}
                          {rules.serveToWin ? ' · Serve to win (game point on serve)' : ''}
                        </p>
                      </>
                    ) : (
                      <p className="mt-3 text-lg font-semibold text-emerald-950">
                        Tournament complete — winner not determined from scores.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h1 className="mb-2 border-b border-zinc-200 pb-1 text-lg font-bold text-zinc-900 sm:text-xl">
                  Tournament live
                </h1>
                <div className="flex flex-wrap gap-2">
                  <div className="w95-inset flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-zinc-800">
                    <Info className="h-4 w-4 shrink-0" />
                    <span>
                      First to {rules.pointsToWin}
                      {rules.bestOf === 3 && ' · Best of 3'}
                      {rules.winByTwo && ' · Win by 2'}
                    </span>
                  </div>
                  {rules.serveToWin && (
                    <div className="flex max-w-full items-center gap-1.5 rounded border border-amber-300/80 bg-amber-50/90 px-2 py-1 text-[11px] font-medium text-amber-950">
                      <Info className="h-3.5 w-3.5 shrink-0 text-amber-800 opacity-80" />
                      <span className="leading-snug">Serve to win on</span>
                    </div>
                  )}
                  {tournamentId && (
                    <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs font-semibold uppercase text-white">
                      <Share2 className="h-4 w-4" />
                      {inviteCode}
                    </div>
                  )}
                  {isFinished && (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-100 px-2 py-1.5 text-xs font-semibold text-emerald-950">
                      <Trophy className="h-4 w-4" />
                      Complete
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isCreator && !isFinished && (
                  <button
                    type="button"
                    onClick={endTournament}
                    className="w95-btn-default flex items-center gap-2 text-xs sm:text-sm"
                  >
                    <Trophy className="h-4 w-4" />
                    End tournament
                  </button>
                )}
                {isFinished && isCreator && (
                  <button
                    type="button"
                    onClick={resetToSetup}
                    className="w95-btn-default flex items-center gap-2 text-xs sm:text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    New tournament
                  </button>
                )}
              </div>
            </div>

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
                isFinished={isFinished}
                rules={rules}
              />
            ) : format === 'pool' ? (
              <CourtScheduleView
                scheduleKind="round-robin"
                matches={matches}
                teams={teams}
                numNets={numNets}
                onUpdateScore={updateScore}
                isFinished={isFinished}
                rules={rules}
                highlightTeamId={isFinished ? displayChampion?.id : undefined}
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
                isFinished={isFinished}
                rules={rules}
              />
            ) : format === 'single' ? (
              <EliminationCourtView
                variant="single"
                matches={matches}
                teams={teams}
                numNets={numNets}
                onUpdateScore={updateScore}
                isFinished={isFinished}
                rules={rules}
                highlightTeamId={isFinished ? displayChampion?.id : undefined}
              />
            ) : (
              <EliminationCourtView
                variant="double"
                matches={matches}
                teams={teams}
                numNets={numNets}
                onUpdateScore={updateScore}
                isFinished={isFinished}
                rules={rules}
                highlightTeamId={isFinished ? displayChampion?.id : undefined}
              />
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
