// === Database Sync Module ===
// Syncs game data to Supabase for logged-in users.
// Guest mode skips all sync — data stays in localStorage only.

import { getSupabase } from './supabase.js';
import { getCurrentUser, isGuestMode } from './auth.js';

// === Save completed session ===
export async function cloudSaveSession(sessionData) {
  if (isGuestMode() || !getCurrentUser()) return null;
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await sb.from('sessions').insert({
      user_id: getCurrentUser().id,
      started_at: new Date(sessionData.startTime).toISOString(),
      ended_at: new Date(sessionData.endTime || Date.now()).toISOString(),
      hands_played: sessionData.handsPlayed || 0,
      pnl: sessionData.pnl || 0,
      pnl_bb: sessionData.pnlBB || 0,
      buy_in: sessionData.buyIn || 0,
      cash_out: sessionData.cashOut || 0,
      big_blind: sessionData.bigBlind || 10,
      accuracy: sessionData.accuracy || null,
      ev_loss: sessionData.evLoss || 0,
      peak_stack: sessionData.peakStack || 0,
      low_stack: sessionData.lowStack || 0,
    }).select('id').single();

    if (error) { console.warn('cloudSaveSession:', error.message); return null; }
    return data?.id || null;
  } catch (e) {
    console.warn('cloudSaveSession failed:', e);
    return null;
  }
}

// === Save hand result ===
export async function cloudSaveHand(handData, sessionId) {
  if (isGuestMode() || !getCurrentUser()) return;
  const sb = getSupabase();
  if (!sb) return;

  try {
    const { error } = await sb.from('hand_results').insert({
      user_id: getCurrentUser().id,
      session_id: sessionId || null,
      hand_number: handData.handNumber,
      position: handData.position,
      hole_cards: handData.holeCards,
      result: handData.result,
      pnl: handData.pnl,
      pot_size: handData.potSize,
      phase_reached: handData.phaseReached,
      vpip: handData.vpip || false,
      pfr: handData.pfr || false,
      went_to_showdown: handData.wentToShowdown || false,
      won_at_showdown: handData.wonAtShowdown || false,
      score_avg: handData.scoreAvg || null,
      ev_loss: handData.evLoss || 0,
    });
    if (error) console.warn('cloudSaveHand:', error.message);
  } catch (e) {
    console.warn('cloudSaveHand failed:', e);
  }
}

// === Update lifetime stats ===
export async function cloudUpdateStats(stats) {
  if (isGuestMode() || !getCurrentUser()) return;
  const sb = getSupabase();
  if (!sb) return;

  try {
    const { error } = await sb.from('user_stats').update({
      total_hands: stats.totalHands || 0,
      total_sessions: stats.totalSessions || 0,
      total_pnl: stats.totalPnl || 0,
      bankroll: stats.bankroll || 10000,
      total_deposited: stats.totalDeposited || 10000,
      vpip: stats.vpip || 0,
      pfr: stats.pfr || 0,
      accuracy: stats.accuracy || 0,
      total_ev_loss: stats.totalEvLoss || 0,
      best_session_pnl: stats.bestSessionPnl || 0,
      worst_session_pnl: stats.worstSessionPnl || 0,
      updated_at: new Date().toISOString(),
    }).eq('user_id', getCurrentUser().id);
    if (error) console.warn('cloudUpdateStats:', error.message);
  } catch (e) {
    console.warn('cloudUpdateStats failed:', e);
  }
}

// === Load user data on login ===
export async function cloudLoadUserData() {
  if (isGuestMode() || !getCurrentUser()) return null;
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const userId = getCurrentUser().id;

    // Parallel fetch: stats + recent sessions
    const [statsRes, sessionsRes] = await Promise.all([
      sb.from('user_stats').select('*').eq('user_id', userId).single(),
      sb.from('sessions').select('*').eq('user_id', userId).order('started_at', { ascending: false }).limit(100),
    ]);

    return {
      stats: statsRes.data,
      sessions: sessionsRes.data || [],
    };
  } catch (e) {
    console.warn('cloudLoadUserData failed:', e);
    return null;
  }
}

// === Get leaderboard ===
export async function cloudGetLeaderboard() {
  const sb = getSupabase();
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from('user_stats')
      .select('user_id, total_hands, total_pnl, total_sessions, accuracy, bankroll, profiles(username)')
      .gte('total_hands', 10)
      .order('total_pnl', { ascending: false })
      .limit(20);

    if (error) { console.warn('cloudGetLeaderboard:', error.message); return []; }
    return (data || []).map((row, i) => ({
      rank: i + 1,
      username: row.profiles?.username || 'Unknown',
      totalPnl: row.total_pnl,
      totalHands: row.total_hands,
      accuracy: row.accuracy,
      bankroll: row.bankroll,
      isMe: getCurrentUser() && row.user_id === getCurrentUser().id,
    }));
  } catch (e) {
    console.warn('cloudGetLeaderboard failed:', e);
    return [];
  }
}

// === Batch sync: push local data to cloud after first login ===
export async function cloudSyncLocalData(bankrollState, handHistory) {
  if (isGuestMode() || !getCurrentUser()) return;
  const sb = getSupabase();
  if (!sb) return;

  try {
    // Sync bankroll
    if (bankrollState) {
      await sb.from('user_stats').update({
        bankroll: bankrollState.bankroll,
        total_deposited: bankrollState.totalDeposited,
        updated_at: new Date().toISOString(),
      }).eq('user_id', getCurrentUser().id);
    }

    // Sync session history (last 20 sessions)
    if (bankrollState?.sessions?.length > 0) {
      const sessionRows = bankrollState.sessions.slice(-20).map(s => ({
        user_id: getCurrentUser().id,
        started_at: new Date(s.startTime).toISOString(),
        ended_at: new Date(s.endTime).toISOString(),
        hands_played: s.handsPlayed,
        pnl: s.pnl,
        pnl_bb: s.pnlBB || 0,
        buy_in: s.buyIn,
        cash_out: s.cashOut,
        big_blind: s.bigBlind,
        peak_stack: s.peakStack,
        low_stack: s.lowStack,
      }));
      await sb.from('sessions').insert(sessionRows);
    }

    console.log('Local data synced to cloud');
  } catch (e) {
    console.warn('cloudSyncLocalData failed:', e);
  }
}
