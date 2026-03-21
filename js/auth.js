// === Authentication Module ===
// Handles login, signup, logout, guest mode.
// Shows auth screen before game loads. Guest mode uses localStorage only.

import { getSupabase, isConfigured } from './supabase.js';

let currentUser = null;
let isGuest = false;
let authReadyCallback = null;

// === Public API ===
export function getCurrentUser() { return currentUser; }
export function isGuestMode() { return isGuest; }
export function isLoggedIn() { return !!currentUser && !isGuest; }

export function onAuthReady(callback) {
  authReadyCallback = callback;
}

// === Initialize Auth ===
export async function initAuth() {
  if (!isConfigured()) {
    // Supabase not configured — auto-guest
    isGuest = true;
    hideAuthScreen();
    if (authReadyCallback) authReadyCallback(null);
    return;
  }

  const sb = getSupabase();
  if (!sb) {
    isGuest = true;
    hideAuthScreen();
    if (authReadyCallback) authReadyCallback(null);
    return;
  }

  // Check for existing session
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      currentUser = session.user;
      await loadProfile();
      hideAuthScreen();
      if (authReadyCallback) authReadyCallback(currentUser);
      return;
    }
  } catch (e) {
    console.warn('Auth session check failed:', e);
  }

  // No session — show auth screen
  showAuthScreen();
}

// === Sign Up ===
async function signUp(email, password, username) {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });

  if (error) throw error;

  // Supabase may require email confirmation
  if (data.user && !data.session) {
    return { needsConfirmation: true };
  }

  currentUser = data.user;
  isGuest = false;
  await loadProfile();
  return { needsConfirmation: false, user: currentUser };
}

// === Sign In ===
async function signIn(email, password) {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentUser = data.user;
  isGuest = false;
  await loadProfile();
  return currentUser;
}

// === Sign Out ===
export async function signOut() {
  const sb = getSupabase();
  if (sb) {
    try { await sb.auth.signOut(); } catch (e) { console.warn('Signout error:', e); }
  }
  currentUser = null;
  isGuest = false;
  // Reload to show auth screen fresh
  window.location.reload();
}

// === Guest Mode ===
function playAsGuest() {
  isGuest = true;
  currentUser = null;
}

// === Load profile data ===
async function loadProfile() {
  if (!currentUser) return;
  const sb = getSupabase();
  try {
    const { data } = await sb.from('profiles').select('username').eq('id', currentUser.id).single();
    if (data) currentUser.username = data.username;
  } catch (e) {
    console.warn('Failed to load profile:', e);
  }
}

// === Re-show auth screen (e.g. from guest mode) ===
let authEventsSetup = false;
export function showLoginScreen() {
  const screen = document.getElementById('authScreen');
  if (screen) {
    screen.style.display = 'flex';
    if (!authEventsSetup) setupAuthEvents();
  }
}

// === Auth Screen UI ===
function showAuthScreen() {
  const screen = document.getElementById('authScreen');
  if (!screen) {
    // Auth screen HTML not present — go guest
    isGuest = true;
    if (authReadyCallback) authReadyCallback(null);
    return;
  }
  screen.style.display = 'flex';
  setupAuthEvents();
  authEventsSetup = true;
}

function hideAuthScreen() {
  const screen = document.getElementById('authScreen');
  if (screen) screen.style.display = 'none';
}

function setupAuthEvents() {
  let mode = 'login'; // 'login' or 'signup'

  const tabLogin = document.getElementById('tabLogin');
  const tabSignup = document.getElementById('tabSignup');
  const form = document.getElementById('authForm');
  const usernameField = document.getElementById('usernameField');
  const submitBtn = document.getElementById('authSubmit');
  const errorEl = document.getElementById('authError');
  const guestBtn = document.getElementById('authGuest');

  function setMode(newMode) {
    mode = newMode;
    tabLogin.classList.toggle('active', mode === 'login');
    tabSignup.classList.toggle('active', mode === 'signup');
    usernameField.style.display = mode === 'signup' ? 'block' : 'none';
    submitBtn.textContent = mode === 'login' ? 'Einloggen' : 'Account erstellen';
    errorEl.textContent = '';
  }

  tabLogin.addEventListener('click', () => setMode('login'));
  tabSignup.addEventListener('click', () => setMode('signup'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const username = document.getElementById('authUsername')?.value.trim();
    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Laden...';

    try {
      if (mode === 'signup') {
        if (!username || username.length < 3) throw new Error('Username muss mind. 3 Zeichen haben');
        if (!/^[A-Za-z0-9_-]{3,20}$/.test(username)) throw new Error('Username: nur Buchstaben, Zahlen, _ und - erlaubt');
        if (password.length < 8) throw new Error('Passwort muss mind. 8 Zeichen haben');
        const result = await signUp(email, password, username);
        if (result.needsConfirmation) {
          errorEl.style.color = 'var(--green)';
          errorEl.textContent = 'Bestaetigung gesendet! Check deine E-Mail.';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Account erstellen';
          return;
        }
      } else {
        await signIn(email, password);
      }

      hideAuthScreen();
      if (authReadyCallback) authReadyCallback(currentUser);
    } catch (err) {
      errorEl.style.color = 'var(--accent)';
      errorEl.textContent = translateError(err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'login' ? 'Einloggen' : 'Account erstellen';
    }
  });

  guestBtn.addEventListener('click', () => {
    playAsGuest();
    hideAuthScreen();
    if (authReadyCallback) authReadyCallback(null);
  });
}

function translateError(msg) {
  if (msg.includes('Invalid login')) return 'E-Mail oder Passwort falsch';
  if (msg.includes('already registered')) return 'E-Mail bereits registriert';
  if (msg.includes('valid email')) return 'Bitte gueltige E-Mail eingeben';
  if (msg.includes('at least')) return 'Passwort zu kurz (mind. 8 Zeichen)';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Zu viele Versuche. Bitte warte einen Moment.';
  if (msg.includes('network') || msg.includes('fetch')) return 'Netzwerkfehler. Bitte pruefe deine Verbindung.';
  // Never expose raw Supabase error messages to users
  console.warn('Auth error:', msg);
  return 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.';
}

// === Get display name (for top bar etc.) ===
export function getDisplayName() {
  if (isGuest) return 'Gast';
  if (currentUser?.username) return currentUser.username;
  if (currentUser?.email) return currentUser.email.split('@')[0];
  return 'Spieler';
}
