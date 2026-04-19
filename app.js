// ============================================================
//  Vaultly — app.js
//  Keys are stored in localStorage — no hardcoding required.
// ============================================================

import { initializeApp }         from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore,
         collection, addDoc,
         query, where, orderBy,
         onSnapshot,
         serverTimestamp }       from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── localStorage keys ─────────────────────────────────────────
const LS_IMGBB    = 'vaultly_imgbb_key';
const LS_FIREBASE = 'vaultly_firebase_config';
const LS_GEMINI   = 'vaultly_gemini_key';

// ── Required Firebase config fields ──────────────────────────
const REQUIRED_FB_FIELDS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];

// ── Runtime state ─────────────────────────────────────────────
let IMGBB_KEY   = null;
let GEMINI_KEY  = null;
let db          = null;
let selectedFile   = null;
let activeCategory = 'all';
let unsubscribe    = null;

// ============================================================
//  DOM REFS
// ============================================================
const starCanvas     = document.getElementById('starfield');

// Setup screen
const setupScreen    = document.getElementById('setupScreen');
const setupForm      = document.getElementById('setupForm');
const setupImgbbKey  = document.getElementById('setupImgbbKey');
const setupFbConfig  = document.getElementById('setupFirebaseConfig');
const setupError     = document.getElementById('setupError');
const setupSaveBtn   = document.getElementById('setupSaveBtn');
const setupSaveLabel = document.getElementById('setupSaveLabel');
const setupSpinner   = document.getElementById('setupSpinner');

// Main app
const resetKeysBtn   = document.getElementById('resetKeysBtn');
const openModalBtn   = document.getElementById('openModalBtn');
const emptyUploadBtn = document.getElementById('emptyUploadBtn');
const modalOverlay   = document.getElementById('modalOverlay');
const closeModalBtn  = document.getElementById('closeModalBtn');
const uploadForm     = document.getElementById('uploadForm');
const dropZone       = document.getElementById('dropZone');
const dropPreview    = document.getElementById('dropPreview');
const fileInput      = document.getElementById('fileInput');
const titleInput       = document.getElementById('titleInput');
const categorySelect   = document.getElementById('categorySelect');
const descriptionInput = document.getElementById('descriptionInput');
const aiBadge          = document.getElementById('aiBadge');
const aiThinking       = document.getElementById('aiThinking');
const formError        = document.getElementById('formError');
const submitBtn      = document.getElementById('submitBtn');
const submitLabel    = document.getElementById('submitLabel');
const btnSpinner     = document.getElementById('btnSpinner');
const galleryGrid    = document.getElementById('galleryGrid');
const emptyState     = document.getElementById('emptyState');
const loadingState   = document.getElementById('loadingState');
const filterBtns     = document.querySelectorAll('.filter-btn');
const lightbox       = document.getElementById('lightbox');
const lightboxClose  = document.getElementById('lightboxClose');
const lightboxImg    = document.getElementById('lightboxImg');
const lightboxTitle  = document.getElementById('lightboxTitle');
const lightboxCat    = document.getElementById('lightboxCat');
const lightboxDesc   = document.getElementById('lightboxDesc');

// ============================================================
//  STARFIELD  (runs regardless of config state)
// ============================================================
(function initStarfield() {
  const ctx        = starCanvas.getContext('2d');
  const STAR_COUNT = 180;
  let w, h, stars;

  function resize() {
    w = starCanvas.width  = window.innerWidth;
    h = starCanvas.height = window.innerHeight;
  }

  function createStars() {
    stars = Array.from({ length: STAR_COUNT }, () => ({
      x:       Math.random() * w,
      y:       Math.random() * h,
      r:       Math.random() * 1.2 + 0.2,
      speed:   Math.random() * 0.25 + 0.05,
      opacity: Math.random() * 0.7 + 0.15,
      twinkle: Math.random() * Math.PI * 2,
    }));
  }

  function draw() {
    if (document.hidden) { requestAnimationFrame(draw); return; }
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      s.twinkle += 0.012;
      const alpha = s.opacity * (0.7 + 0.3 * Math.sin(s.twinkle));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
      ctx.fill();
      s.y += s.speed;
      if (s.y > h + 2) { s.y = -2; s.x = Math.random() * w; }
    }
    requestAnimationFrame(draw);
  }

  resize();
  createStars();
  requestAnimationFrame(draw);
  window.addEventListener('resize', () => { resize(); createStars(); });
})();

// ============================================================
//  CONFIG  (localStorage read / write / clear)
// ============================================================
function loadConfig() {
  try {
    const imgbbKey    = localStorage.getItem(LS_IMGBB);
    const fbConfigRaw = localStorage.getItem(LS_FIREBASE);
    if (!imgbbKey || !fbConfigRaw) return null;
    const fbConfig  = JSON.parse(fbConfigRaw);
    const geminiKey = localStorage.getItem(LS_GEMINI) || null;
    return { imgbbKey, fbConfig, geminiKey };
  } catch {
    return null;
  }
}

function saveConfig(imgbbKey, fbConfig) {
  try {
    localStorage.setItem(LS_IMGBB,    imgbbKey);
    localStorage.setItem(LS_FIREBASE, JSON.stringify(fbConfig));
  } catch {
    throw new Error('Could not save to localStorage. Try disabling private/incognito mode.');
  }
}

function clearConfig() {
  try {
    localStorage.removeItem(LS_IMGBB);
    localStorage.removeItem(LS_FIREBASE);
  } catch { /* ignore */ }
  location.reload();
}

// ============================================================
//  SETUP FORM
// ============================================================
setupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearSetupError();

  const imgbbKey    = setupImgbbKey.value.trim();
  const fbConfigRaw = setupFbConfig.value.trim();

  // Validate ImgBB key
  if (!imgbbKey) {
    showSetupError('Please enter your ImgBB API key.');
    setupImgbbKey.focus();
    return;
  }

  // Parse and validate Firebase config
  let fbConfig;
  try {
    // Accept both plain JS object notation and strict JSON
    fbConfig = parseFirebaseConfig(fbConfigRaw);
  } catch {
    showSetupError('Firebase config is not valid JSON. Copy the exact object from the Firebase console.');
    setupFbConfig.focus();
    return;
  }

  const missingFields = REQUIRED_FB_FIELDS.filter(f => !fbConfig[f]);
  if (missingFields.length) {
    showSetupError(`Firebase config is missing: ${missingFields.join(', ')}.`);
    setupFbConfig.focus();
    return;
  }

  // Save + boot
  setSetupLoading(true);
  try {
    saveConfig(imgbbKey, fbConfig);
    bootApp({ imgbbKey, fbConfig });
    hideSetupScreen();
  } catch (err) {
    showSetupError(err.message || 'Could not save settings.');
    setSetupLoading(false);
  }
});

/**
 * Parses Firebase config accepting both:
 *   - Strict JSON  {"apiKey": "..."}
 *   - JS object    {apiKey: "..."}  (from Firebase console copy-paste)
 */
function parseFirebaseConfig(raw) {
  // Strip outer "const firebaseConfig = " wrapper if user pasted the whole line
  let cleaned = raw
    .replace(/^[\s\S]*?=\s*/, '')   // remove "const x ="
    .replace(/;[\s\S]*$/, '')       // remove trailing semicolon + anything after
    .trim();

  // Try strict JSON first
  try {
    return JSON.parse(cleaned);
  } catch { /* fall through */ }

  // Convert JS object literal → JSON:
  //   unquoted keys  →  "key"
  //   single quotes  →  double quotes
  //   trailing commas removed
  const jsonLike = cleaned
    .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":')   // quote keys
    .replace(/'/g, '"')                                       // single → double quotes
    .replace(/,\s*([}\]])/g, '$1');                          // trailing commas

  return JSON.parse(jsonLike);
}

function showSetupError(msg)  { setupError.textContent = msg; }
function clearSetupError()    { setupError.textContent = ''; }

function setSetupLoading(on) {
  setupSaveBtn.disabled       = on;
  setupSaveLabel.textContent  = on ? 'Connecting…' : 'Save & Open Vaultly';
  setupSpinner.classList.toggle('visible', on);
}

function hideSetupScreen() {
  setupScreen.classList.add('hidden');
  // Show the "Reset Keys" button in the header now that we're configured
  resetKeysBtn.style.display = 'inline-flex';
}

// ============================================================
//  BOOT APP  — called after valid config is available
// ============================================================
function bootApp({ imgbbKey, fbConfig, geminiKey }) {
  IMGBB_KEY  = imgbbKey;
  GEMINI_KEY = geminiKey || null;

  // Initialise Firebase (safe to call multiple times with same config)
  const fbApp = initializeApp(fbConfig);
  db = getFirestore(fbApp);

  // Start gallery
  subscribeToGallery('all');
}

// ============================================================
//  MODAL (upload)
// ============================================================
function openModal() {
  modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  titleInput.focus();
}

function closeModal() {
  modalOverlay.classList.remove('open');
  document.body.style.overflow = '';
  resetUploadForm();
}

openModalBtn.addEventListener('click', openModal);
emptyUploadBtn.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (lightbox.classList.contains('open')) closeLightbox();
    else if (modalOverlay.classList.contains('open')) closeModal();
  }
});

// ── Reset keys button ─────────────────────────────────────────
resetKeysBtn.addEventListener('click', () => {
  if (confirm('Reset your API keys? The page will reload and you\'ll need to re-enter them.')) {
    if (unsubscribe) unsubscribe();
    clearConfig();
  }
});

// ============================================================
//  FILE / DROP ZONE
// ============================================================
dropZone.addEventListener('click', (e) => { if (e.target !== fileInput) fileInput.click(); });
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleFile(file);
});

function handleFile(file) {
  if (file.size > 32 * 1024 * 1024) {
    showFormError('Image must be under 32 MB.');
    return;
  }
  selectedFile = file;
  dropPreview.src = URL.createObjectURL(file);
  dropPreview.classList.add('visible');
  dropZone.classList.add('has-preview');
  clearFormError();

  // Kick off Gemini description generation in the background
  if (GEMINI_KEY) generateDescription(file);
}

// ── Gemini Vision — auto-generate description ─────────────────
async function generateDescription(file) {
  // Show thinking state
  aiBadge.style.display    = 'none';
  aiThinking.style.display = 'inline-flex';
  descriptionInput.placeholder = 'Gemini is reading your image…';
  descriptionInput.classList.remove('ai-filled');

  try {
    const base64    = await fileToBase64(file);
    const mimeType  = file.type || 'image/jpeg';

    const payload = {
      contents: [{
        parts: [
          {
            inline_data: { mime_type: mimeType, data: base64 },
          },
          {
            text: 'Describe this image in 1–2 vivid, concise sentences suitable for a photo gallery caption. Focus on the subject, mood, and setting. Do not start with "This image" or "The photo".',
          },
        ],
      }],
      generationConfig: {
        temperature:     0.7,
        maxOutputTokens: 120,
      },
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      }
    );

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error?.message || 'Gemini request failed.');
    }

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) {
      descriptionInput.value = text;
      descriptionInput.classList.add('ai-filled');
    }
  } catch (err) {
    console.warn('[Vaultly] Gemini description failed:', err.message);
    descriptionInput.placeholder = 'Could not generate description — type one manually.';
  } finally {
    aiThinking.style.display = 'none';
    aiBadge.style.display    = 'inline-flex';
  }
}

// ============================================================
//  UPLOAD FORM
// ============================================================
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFormError();

  const title    = titleInput.value.trim();
  const category = categorySelect.value;

  const description = descriptionInput.value.trim();

  if (!selectedFile) { showFormError('Please choose an image.');   return; }
  if (!title)        { showFormError('Please enter a title.');      return; }
  if (!category)     { showFormError('Please choose a category.');  return; }

  setUploadLoading(true);
  try {
    const { imageUrl, thumbnailUrl } = await uploadToImgBB(selectedFile);
    await saveToFirestore({ title, category, description, imageUrl, thumbnailUrl });
    closeModal();
  } catch (err) {
    console.error(err);
    showFormError(err.message || 'Upload failed. Please try again.');
  } finally {
    setUploadLoading(false);
  }
});

// ── ImgBB upload ──────────────────────────────────────────────
async function uploadToImgBB(file) {
  const base64   = await fileToBase64(file);
  const formData = new FormData();
  formData.append('key',   IMGBB_KEY);
  formData.append('image', base64);

  const res  = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: formData });
  const json = await res.json();

  if (!json.success) throw new Error(json.error?.message || 'ImgBB upload failed.');

  return {
    imageUrl:     json.data.url,
    thumbnailUrl: json.data.thumb?.url || json.data.url,
  };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.replace(/^data:[^;]+;base64,/, ''));
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

// ── Firestore save ────────────────────────────────────────────
async function saveToFirestore({ title, category, description, imageUrl, thumbnailUrl }) {
  await addDoc(collection(db, 'photos'), {
    title,
    category,
    description: description || '',
    imageUrl,
    thumbnailUrl,
    createdAt: serverTimestamp(),
  });
}

// ── Upload form helpers ───────────────────────────────────────
function setUploadLoading(on) {
  submitBtn.disabled      = on;
  submitLabel.textContent = on ? 'Uploading…' : 'Upload to Vault';
  btnSpinner.classList.toggle('visible', on);
}

function showFormError(msg) { formError.textContent = msg; }
function clearFormError()   { formError.textContent = ''; }

function resetUploadForm() {
  uploadForm.reset();
  selectedFile = null;
  dropPreview.src = '';
  dropPreview.classList.remove('visible');
  dropZone.classList.remove('has-preview', 'drag-over');
  descriptionInput.classList.remove('ai-filled');
  descriptionInput.placeholder = 'Drop an image above — Gemini will auto-generate a description for you';
  aiBadge.style.display    = 'inline-flex';
  aiThinking.style.display = 'none';
  clearFormError();
  setUploadLoading(false);
}

// ============================================================
//  GALLERY — Firestore real-time listener
// ============================================================
function subscribeToGallery(category) {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  showLoadingState(true);

  const photosRef = collection(db, 'photos');
  const q = category === 'all'
    ? query(photosRef, orderBy('createdAt', 'desc'))
    : query(photosRef, where('category', '==', category), orderBy('createdAt', 'desc'));

  unsubscribe = onSnapshot(q, (snapshot) => {
    showLoadingState(false);
    renderGallery(snapshot.docs);
  }, (err) => {
    showLoadingState(false);
    console.error('Firestore error:', err);
    if (err.code === 'failed-precondition') {
      showEmptyState(true);
      console.warn(
        '⚠ Firestore needs a composite index for category + createdAt.\n' +
        'Check the error link above in the console — click it to create the index automatically.'
      );
    } else if (err.code === 'permission-denied') {
      showEmptyState(true);
      console.warn('⚠ Firestore permission denied. Enable test mode rules in the Firebase console.');
    } else {
      showEmptyState(true);
    }
  });
}

function renderGallery(docs) {
  galleryGrid.innerHTML = '';
  if (docs.length === 0) { showEmptyState(true); return; }
  showEmptyState(false);
  docs.forEach((doc, i) => galleryGrid.appendChild(buildCard(doc.data(), i)));
}

function buildCard(data, index) {
  const card = document.createElement('div');
  card.className = 'photo-card';
  card.style.animationDelay = `${index * 45}ms`;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `View ${data.title}`);

  const img = document.createElement('img');
  img.src      = data.thumbnailUrl;
  img.alt      = data.title;
  img.loading  = 'lazy';
  img.decoding = 'async';

  const overlay = document.createElement('div');
  overlay.className = 'card-overlay';
  overlay.innerHTML = `
    <div class="card-title">${escapeHtml(data.title)}</div>
    <div class="card-cat">${escapeHtml(data.category)}</div>
  `;

  card.appendChild(img);
  card.appendChild(overlay);

  const openLb = () => openLightbox(data);
  card.addEventListener('click', openLb);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLb(); }
  });

  return card;
}

function showEmptyState(on)   { emptyState.classList.toggle('visible', on); }
function showLoadingState(on) {
  loadingState.classList.toggle('visible', on);
  if (on) galleryGrid.innerHTML = '';
}

// ============================================================
//  FILTER
// ============================================================
filterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    filterBtns.forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    activeCategory = btn.dataset.category;
    subscribeToGallery(activeCategory);
  });
});

// ============================================================
//  LIGHTBOX
// ============================================================
function openLightbox(data) {
  lightboxImg.src           = data.imageUrl;
  lightboxImg.alt           = data.title;
  lightboxTitle.textContent = data.title;
  lightboxCat.textContent   = data.category;
  lightboxDesc.textContent  = data.description || '';
  lightboxDesc.style.display = data.description ? 'block' : 'none';
  lightbox.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.remove('open');
  document.body.style.overflow = '';
  lightboxImg.src = '';
}

lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });

// ============================================================
//  UTIL
// ============================================================
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================
//  INIT — check for saved config and either show setup or boot
// ============================================================
const savedConfig = loadConfig();

if (savedConfig) {
  // Keys already saved — skip setup, go straight to gallery
  hideSetupScreen();
  bootApp(savedConfig);
} else {
  // First run — show the setup screen, focus first input
  setupImgbbKey.focus();
}
