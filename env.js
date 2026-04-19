// ============================================================
//  Vaultly — env.js
//  Reads config from the .env file values and pre-loads them
//  into localStorage so the setup screen is skipped.
//
//  ⚠  DO NOT commit this file — add it to .gitignore
// ============================================================

(function () {
  const IMGBB_KEY     = 'f4aec63b47450917b0ddfe6aafcb413d';
  const GEMINI_KEY    = 'AIzaSyCZKxRl-EqJjkHfz4bGQsioFZMm7thYUs4';

  const FIREBASE_CONFIG = {
    apiKey:            'AIzaSyCV-72-U-AxvHLMtxle2RnpfGwsoVNyI2c',
    authDomain:        'astrovault-f257c.firebaseapp.com',
    projectId:         'astrovault-f257c',
    storageBucket:     'astrovault-f257c.firebasestorage.app',
    messagingSenderId: '828751540139',
    appId:             '1:828751540139:web:6bd62480a31d117f592cee',
  };

  // Only write to localStorage if not already set — preserves
  // any keys entered manually via the setup screen.
  try {
    if (!localStorage.getItem('vaultly_imgbb_key')) {
      localStorage.setItem('vaultly_imgbb_key', IMGBB_KEY);
    }
    if (!localStorage.getItem('vaultly_firebase_config')) {
      localStorage.setItem('vaultly_firebase_config', JSON.stringify(FIREBASE_CONFIG));
    }
    if (!localStorage.getItem('vaultly_gemini_key')) {
      localStorage.setItem('vaultly_gemini_key', GEMINI_KEY);
    }
  } catch (e) {
    console.warn('[Vaultly] Could not write config to localStorage:', e.message);
  }
})();
