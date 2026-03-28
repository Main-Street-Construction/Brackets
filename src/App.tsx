import React, { useState, useEffect } from 'react';
import { TournamentFormat, Team, Match, TournamentRules, SetScore } from './types';
import {
  generateSingleElimination,
  generateDoubleElimination,
  generatePoolPlay,
  generatePlayTwice
} from './lib/tournament/generate';
import { assignNets } from './lib/tournament/nets';
import {
  autoAdvanceByes,
  propagateWinnerToNext,
  propagateLoserToBracket
} from './lib/tournament/advance';
import { matchOutcomeFromSets } from './lib/tournament/scoring';
import { TeamCalculator } from './components/TeamCalculator';
import { BracketView } from './components/BracketView';
import { PoolPlayView } from './components/PoolPlayView';
import { Trophy, Settings, Play, Plus, Trash2, LayoutGrid, GitMerge, Repeat, Users, Share2, LogIn, ShieldCheck, Info, RefreshCw, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { db, auth } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  updateDoc, 
  query, 
  where, 
  getDocs,
  addDoc,
  deleteDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  User,
  signOut 
} from 'firebase/auth';

import { WinnersListView } from './components/WinnersListView';

const DEFAULT_RULES: TournamentRules = {
  pointsToWin: 25,
  bestOf: 3,
  thirdSetTo: 15,
  serveToWin: false,
  winByTwo: true,
  winnerStays: true,
  maxConsecutiveWins: 3,
  onMaxWins: 'other-stays'
};

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
    return (saved as TournamentFormat) || 'single';
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
    return saved ? JSON.parse(saved) : DEFAULT_RULES;
  });

  // Persistence for local mode and tournamentId
  useEffect(() => {
    if (tournamentId) {
      localStorage.setItem('tournament_id', tournamentId);
      return;
    } else {
      localStorage.removeItem('tournament_id');
    }
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

  // Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const logout = () => signOut(auth);

  // Sync Tournament
  useEffect(() => {
    if (!tournamentId) return;

    const unsubTournament = onSnapshot(doc(db, 'tournaments', tournamentId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setFormat(data.format);
        setIsStarted(data.isStarted);
        setIsFinished(data.isFinished || false);
        setRules(data.rules || DEFAULT_RULES);
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
    if (!user) return;
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
    const q = query(collection(db, 'tournaments'), where('inviteCode', '==', joinCode.toUpperCase()));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      setTournamentId(snapshot.docs[0].id);
    } else {
      alert('Invalid invite code');
    }
  };

  const addTeam = async (name?: string) => {
    console.log('Adding team:', name);
    const newId = `team-${Date.now()}`;
    
    if (tournamentId) {
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
    if (tournamentId) {
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
    if (tournamentId) {
      await updateDoc(doc(db, 'tournaments', tournamentId, 'teams', id), { name });
    } else {
      setTeams(teams.map(t => t.id === id ? { ...t, name } : t));
    }
  };

  const updateRules = async (newRules: Partial<TournamentRules>) => {
    const updated = { ...rules, ...newRules };
    setRules(updated);
    if (tournamentId) {
      await updateDoc(doc(db, 'tournaments', tournamentId), { rules: updated });
    }
  };

  const startTournament = async () => {
    let initialMatches: Match[] = [];

    if (format === 'single') {
      initialMatches = generateSingleElimination(teams);
      initialMatches = autoAdvanceByes(initialMatches);
      initialMatches = assignNets(initialMatches, numNets);
    } else if (format === 'double') {
      initialMatches = generateDoubleElimination(teams);
      initialMatches = autoAdvanceByes(initialMatches);
      initialMatches = assignNets(initialMatches, numNets);
    } else if (format === 'pool') {
      initialMatches = generatePoolPlay(teams);
      initialMatches = assignNets(initialMatches, numNets);
    } else if (format === 'play-twice') {
      initialMatches = generatePlayTwice(teams);
      initialMatches = assignNets(initialMatches, numNets);
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

      if (tournamentId) {
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

    if (tournamentId) {
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
      if (tournamentId) {
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
      if (tournamentId) {
        await updateDoc(doc(db, 'tournaments', tournamentId), { isFinished: true });
      } else {
        setIsFinished(true);
      }
    }
  };

  const restartTournament = async () => {
    if (window.confirm("Start over? This will clear all current scores and matches.")) {
      if (tournamentId) {
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
      if (tournamentId) {
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

      if (tournamentId) {
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
    if (tournamentId) {
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
        
        if (tournamentId) {
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
        if (tournamentId) {
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
    if (winnerId && format !== 'winners-list') {
      tournamentComplete = propagateWinnerToNext(
        updatedMatches,
        currentMatch,
        matchId,
        winnerId
      ).tournamentComplete;
    }

    if (currentMatch.loserMatchId && loserId) {
      propagateLoserToBracket(updatedMatches, currentMatch, matchId, loserId);
    }

    const matchesWithNets = assignNets(updatedMatches, numNets);

    if (tournamentId) {
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
      if (tournamentId) {
        await updateDoc(doc(db, 'tournaments', tournamentId), { isFinished: true });
      } else {
        setIsFinished(true);
      }
    }
  };

  const resetTournament = async () => {
    if (window.confirm("Are you sure you want to reset the tournament? All scores will be lost.")) {
      if (tournamentId) {
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

  return (
    <div className="min-h-screen pb-24 pt-[max(0.5rem,env(safe-area-inset-top))] px-2 sm:px-3">
      <div className="max-w-7xl mx-auto w95-window flex flex-col min-h-[calc(100dvh-1.25rem)] sticky top-1 z-20">
        <header className="shrink-0">
          <div className="w95-titlebar">
            <div className="flex items-center gap-2 min-w-0">
              <Trophy className="w-4 h-4 shrink-0 opacity-90" />
              <span className="truncate text-xs sm:text-sm">Brackets — Tournament Explorer</span>
            </div>
          </div>
          <div className="w95-toolbar flex-wrap justify-end gap-1">
            {user ? (
              <div className="flex flex-wrap items-center justify-end gap-1 w-full sm:w-auto">
                {!tournamentId && !isStarted && (
                  <>
                    <input
                      type="text"
                      placeholder="Code"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      className="w95-input w-20 sm:w-32 uppercase text-xs py-1 min-h-9"
                    />
                    <button type="button" onClick={joinTournament} className="w95-btn flex items-center gap-1 text-xs">
                      <LogIn className="w-3.5 h-3.5" />
                      Join
                    </button>
                  </>
                )}
                {tournamentId && (
                  <span className="w95-inset px-2 py-1 text-xs font-bold flex items-center gap-1">
                    <Share2 className="w-3.5 h-3.5" />
                    {inviteCode}
                  </span>
                )}
                {isStarted && (isCreator || !tournamentId) && (
                  <>
                    {!isFinished && (
                      <button type="button" onClick={finishTournament} className="w95-btn flex items-center gap-1 text-xs">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Finish</span>
                      </button>
                    )}
                    <button type="button" onClick={abortTournament} className="w95-btn flex items-center gap-1 text-xs">
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Abort</span>
                    </button>
                    <button type="button" onClick={resetTournament} className="w95-btn flex items-center gap-1 text-xs">
                      <Settings className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Reset</span>
                    </button>
                  </>
                )}
                <button type="button" onClick={logout} className="w95-btn text-xs">
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-1 w-full">
                <span className="hidden sm:inline w95-inset px-2 py-1 text-xs font-bold">
                  Local Mode
                </span>
                <button type="button" onClick={login} className="w95-btn-default text-xs flex items-center gap-1">
                  <LogIn className="w-3.5 h-3.5" />
                  Sign In
                </button>
              </div>
            )}
          </div>
        </header>

      <main className="flex-1 overflow-auto bg-[#c0c0c0] px-2 py-3 sm:px-4 sm:py-4">
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
                      {[25, 21, 15, 0].map((p) => (
                        <button
                          key={p}
                          onClick={() => updateRules({ pointsToWin: p as any })}
                          className={cn(
                            "px-4 py-2 rounded-lg text-sm font-bold border transition-all",
                            rules.pointsToWin === p 
                              ? "bg-grey-blue text-white border-grey-blue" 
                              : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
                          )}
                        >
                          {p === 0 ? 'Traditional' : `To ${p}`}
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
                              ? "bg-grey-blue text-white border-grey-blue" 
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
                        rules.winByTwo ? "bg-grey-blue" : "bg-zinc-200"
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

                    <button
                      onClick={() => updateRules({ serveToWin: !rules.serveToWin })}
                      className="flex items-center gap-3 group"
                    >
                      <div className={cn(
                        "w-12 h-6 rounded-full transition-all relative",
                        rules.serveToWin ? "bg-grey-blue" : "bg-zinc-200"
                      )}>
                        <div className={cn(
                          "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                          rules.serveToWin ? "left-7" : "left-1"
                        )} />
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-bold text-zinc-700">Serve to Win</div>
                        <div className="text-xs text-zinc-500">Must be serving to score the winning point.</div>
                      </div>
                    </button>

                    {format === 'winners-list' && (
                      <>
                        <button
                          onClick={() => updateRules({ winnerStays: !rules.winnerStays })}
                          className="flex items-center gap-3 group"
                        >
                          <div className={cn(
                            "w-12 h-6 rounded-full transition-all relative",
                            rules.winnerStays ? "bg-grey-blue" : "bg-zinc-200"
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
                                      ? "bg-grey-blue text-white border-grey-blue" 
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
                                      ? "bg-grey-blue text-white border-grey-blue" 
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
                                      ? "bg-grey-blue text-white border-grey-blue" 
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
                            if (tournamentId) updateDoc(doc(db, 'tournaments', tournamentId), { numNets: val });
                          }}
                          className="flex-1 accent-grey-blue h-2 bg-zinc-100 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="w-12 h-12 rounded-xl bg-grey-blue/5 border border-grey-blue/20 flex items-center justify-center text-lg font-bold text-grey-blue">
                          {numNets}
                        </div>
                      </div>
                    </div>
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
                            className="flex-1 accent-grey-blue h-2 bg-zinc-100 rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="w-12 h-12 rounded-xl bg-grey-blue/5 border border-grey-blue/20 flex items-center justify-center text-lg font-bold text-grey-blue">
                            {preSignupCount}
                          </div>
                        </div>
                        <p className="text-[10px] text-zinc-500 italic">Automatically generates placeholder teams to start the queue.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Users className="w-5 h-5 text-grey-blue" />
                    Teams ({teams.length})
                  </h2>
                  <div className="flex gap-2">
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
                        className="bg-grey-green/10 text-grey-blue px-4 py-2 rounded-lg text-sm font-medium hover:bg-grey-green/20 transition-colors flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Quick Add {preSignupCount}
                      </button>
                    )}
                    <button
                      onClick={() => addTeam()}
                      className="bg-grey-blue text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-grey-blue/90 transition-colors flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Team
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white border border-zinc-200 text-xs font-bold text-zinc-500 shadow-sm">
                          {index + 1}
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
                <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
                  <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <LayoutGrid className="w-5 h-5 text-grey-blue" />
                    Tournament Style
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { id: 'single', name: 'Single Elimination', icon: GitMerge, desc: 'Win or go home.' },
                      { id: 'double', name: 'Double Elimination', icon: GitMerge, desc: 'Two losses to be out.' },
                      { id: 'pool', name: 'Pool Play', icon: LayoutGrid, desc: 'Round robin style.' },
                      { id: 'play-twice', name: 'Play Twice', icon: Repeat, desc: 'Everyone gets 2 games.' },
                    ].map((style) => (
                      <button
                        key={style.id}
                        onClick={() => setFormat(style.id as TournamentFormat)}
                        className={cn(
                          "p-4 rounded-xl border-2 text-left transition-all",
                          format === style.id 
                            ? "border-grey-blue bg-grey-green/5 ring-4 ring-grey-green/5" 
                            : "border-zinc-100 hover:border-zinc-200 bg-white"
                        )}
                      >
                        <style.icon className={cn("w-6 h-6 mb-2", format === style.id ? "text-grey-blue" : "text-zinc-400")} />
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
                <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
                  <h3 className="font-bold text-zinc-900 mb-2 flex items-center gap-2">
                    <Share2 className="w-5 h-5 text-grey-blue" />
                    Cloud Sync (Optional)
                  </h3>
                  <p className="text-zinc-500 text-sm mb-6">
                    Go Live to share with players and update scores across all devices in real-time.
                  </p>
                  {!user ? (
                    <button
                      onClick={login}
                      className="w-full bg-grey-green/10 text-grey-blue py-3 rounded-lg font-bold hover:bg-grey-green/20 transition-colors flex items-center justify-center gap-2"
                    >
                      <LogIn className="w-4 h-4" />
                      Sign in to Go Live
                    </button>
                  ) : (
                    <button
                      onClick={createTournament}
                      className="w-full bg-grey-blue text-white py-3 rounded-lg font-bold hover:bg-grey-blue/90 transition-colors"
                    >
                      Create Cloud Tournament
                    </button>
                  )}
                </div>
              )}

              {activeTab === 'tournaments' && <TeamCalculator />}
              
              {matches.length > 0 ? (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setIsStarted(true)}
                    className="w-full bg-grey-green text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-grey-green/20 hover:bg-grey-green/90 transition-all flex items-center justify-center gap-3"
                  >
                    <Play className="w-6 h-6 fill-current" />
                    Resume {activeTab === 'tournaments' ? 'Tournament' : 'Open Play'}
                  </button>
                  <button
                    onClick={restartTournament}
                    disabled={tournamentId && !isCreator}
                    className="w-full bg-white text-zinc-500 py-3 rounded-xl font-bold text-sm border border-zinc-200 hover:bg-zinc-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Reset & Start New
                  </button>
                </div>
              ) : (
                <button
                  onClick={startTournament}
                  disabled={(activeTab === 'tournaments' && teams.length < 2) || (activeTab === 'winners-list' && preSignupCount < 2) || (tournamentId && !isCreator)}
                  className="w-full bg-grey-blue text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-grey-blue/20 hover:bg-grey-blue/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-black mb-2 border-b-2 border-[#808080] pb-1">Tournament Live</h1>
                <div className="flex flex-wrap gap-2">
                  <div className="w95-inset px-2 py-1.5 flex items-center gap-2 text-xs font-bold">
                    <Info className="w-4 h-4 shrink-0" />
                    <span className="text-black">
                      {rules.pointsToWin === 0 ? 'Traditional' : `To ${rules.pointsToWin}`}
                      {rules.bestOf === 3 && ' • Best of 3'}
                      {rules.serveToWin && ' • Serve to Win'}
                      {rules.winByTwo && ' • Win by 2'}
                    </span>
                  </div>
                  {tournamentId && (
                    <div className="px-2 py-1.5 flex items-center gap-2 text-xs font-bold uppercase bg-[#000080] text-white border border-black">
                      <Share2 className="w-4 h-4" />
                      {inviteCode}
                    </div>
                  )}
                  {isFinished && (
                    <div className="w95-inset px-2 py-1.5 flex items-center gap-2 text-xs font-bold bg-[#d4e8d4]">
                      <Trophy className="w-4 h-4" />
                      Finished
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsStarted(false)}
                  className="w95-btn flex items-center gap-2 text-xs sm:text-sm"
                >
                  <Settings className="w-4 h-4" />
                  Setup
                </button>
                {isCreator && !isFinished && (
                  <button type="button" onClick={endTournament} className="w95-btn-default flex items-center gap-2 text-xs sm:text-sm">
                    <Trophy className="w-4 h-4" />
                    End
                  </button>
                )}
                {isFinished && isCreator && (
                  <button type="button" onClick={resetToSetup} className="w95-btn-default flex items-center gap-2 text-xs sm:text-sm">
                    <Plus className="w-4 h-4" />
                    New
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
            ) : (format === 'pool' || format === 'play-twice') ? (
              <PoolPlayView matches={matches} teams={teams} onUpdateScore={updateScore} isFinished={isFinished} rules={rules} />
            ) : (
              <BracketView matches={matches} teams={teams} onUpdateScore={updateScore} isFinished={isFinished} rules={rules} />
            )}
          </div>
        )}
      </main>
        <footer className="w95-statusbar shrink-0">
          <span>{isStarted ? (isFinished ? 'Tournament finished' : 'Tournament in progress') : 'Ready to set up'}</span>
          {tournamentId && <span>Cloud sync on</span>}
          {!tournamentId && <span>Local only</span>}
        </footer>
      </div>
    </div>
  );
}
