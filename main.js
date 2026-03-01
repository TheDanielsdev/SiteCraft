// ─────────────────────────────────────────────────────────────
//  SiteCraft — main.js
//  Supabase Auth + Edge Functions (no API keys in browser)
// ─────────────────────────────────────────────────────────────

// ── CONFIG — fill these in after creating your Supabase project ──
const SUPABASE_URL     = 'https://zmmrersjvlapqhfndlno.supabase.co';
const SUPABASE_ANON    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbXJlcnNqdmxhcHFoZm5kbG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNzg0OTAsImV4cCI6MjA4Nzk1NDQ5MH0.neynEzGdJsjuH5RE_vtcY1TJ2kgspyBAmgjTF2ItGMI';
const PAYSTACK_PUB_KEY = 'pk_test_0382ed3e2734cca81d7d4a3c832d7457bcf9c5da';
// ─────────────────────────────────────────────────────────────────

// Supabase JS loaded via CDN in index.html
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// State
let currentUser     = null;
let currentSession  = null;
let selectedPlan    = null;
let currentStep     = 1;
let selectedColor   = '#2563eb';
let selectedStyle   = '';
let selectedType    = '';
let generatedHTML   = '';
let paystackRef     = null;   // set after successful payment

// ─────────────────────────────────────────────────────────────
//  AUTH — listen for session changes
// ─────────────────────────────────────────────────────────────
sb.auth.onAuthStateChange((_event, session) => {
  currentSession = session;
  currentUser    = session?.user ?? null;
  updateAuthUI();
});

function updateAuthUI() {
  const userInfo = document.getElementById('userInfo');
  const authBtns = document.getElementById('authBtns');
  if (!userInfo || !authBtns) return;

  if (currentUser) {
    userInfo.textContent = currentUser.email;
    userInfo.style.display = 'block';
    authBtns.style.display = 'none';
  } else {
    userInfo.style.display = 'none';
    authBtns.style.display = 'flex';
  }
}

// ─────────────────────────────────────────────────────────────
//  AUTH MODAL
// ─────────────────────────────────────────────────────────────
function openAuthModal(mode = 'login') {
  document.getElementById('authModal').classList.add('open');
  setAuthMode(mode);
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('open');
  clearAuthError();
}

function setAuthMode(mode) {
  const isLogin = mode === 'login';
  document.getElementById('authModalTitle').textContent   = isLogin ? 'Sign In' : 'Create Account';
  document.getElementById('authSubmitBtn').textContent    = isLogin ? 'Sign In' : 'Create Account';
  document.getElementById('authSwitchText').textContent   = isLogin ? "Don't have an account?" : 'Already have an account?';
  document.getElementById('authSwitchLink').textContent   = isLogin ? 'Sign up' : 'Sign in';
  document.getElementById('authSwitchLink').onclick       = () => setAuthMode(isLogin ? 'signup' : 'login');
  document.getElementById('authSubmitBtn').onclick        = isLogin ? handleLogin : handleSignup;
  document.getElementById('authNameGroup').style.display = isLogin ? 'none' : 'block';
  clearAuthError();
}

async function handleSignup() {
  const email    = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const name     = document.getElementById('authName').value.trim();

  if (!email || !password) { setAuthError('Please fill in all fields.'); return; }
  if (password.length < 6) { setAuthError('Password must be at least 6 characters.'); return; }

  setAuthLoading(true);
  const { error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name: name } }
  });
  setAuthLoading(false);

  if (error) { setAuthError(error.message); return; }
  closeAuthModal();
  showToast('Account created! You are now signed in.', 'success');
}

async function handleLogin() {
  const email    = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;

  if (!email || !password) { setAuthError('Please enter your email and password.'); return; }

  setAuthLoading(true);
  const { error } = await sb.auth.signInWithPassword({ email, password });
  setAuthLoading(false);

  if (error) { setAuthError('Invalid email or password.'); return; }
  closeAuthModal();
  showToast('Welcome back!', 'success');
}

async function handleSignOut() {
  await sb.auth.signOut();
  showToast('Signed out.', 'success');
}

function setAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.style.display = 'block';
}

function clearAuthError() {
  const el = document.getElementById('authError');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

function setAuthLoading(loading) {
  const btn = document.getElementById('authSubmitBtn');
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait…' : btn.textContent;
}

// ─────────────────────────────────────────────────────────────
//  NAV + SECTION TRANSITIONS
// ─────────────────────────────────────────────────────────────
function scrollToPricing() {
  document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' });
}

function goBack(from, to) {
  document.getElementById(from).style.display = 'none';
  if (to === 'pricing') {
    document.getElementById('landing').style.display = 'flex';
    document.getElementById('pricing').style.display = 'block';
    setTimeout(() => document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' }), 80);
  } else {
    document.getElementById(to).style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ─────────────────────────────────────────────────────────────
//  PLAN SELECTION
// ─────────────────────────────────────────────────────────────
function selectPlan(card) {
  // Must be logged in to proceed
  if (!currentUser) {
    showToast('Please sign in or create an account first.', 'error');
    openAuthModal('signup');
    return;
  }

  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');

  selectedPlan = {
    type:  card.dataset.plan,
    price: parseInt(card.dataset.price),
    name:  card.querySelector('.plan-name').textContent
  };

  document.getElementById('checkoutPlanName').textContent  = selectedPlan.name + ' Landing Page';
  document.getElementById('checkoutPlanPrice').textContent = '₦' + selectedPlan.price.toLocaleString();
  document.getElementById('payerEmail').value              = currentUser.email;

  setTimeout(() => {
    document.getElementById('landing').style.display  = 'none';
    document.getElementById('pricing').style.display  = 'none';
    document.getElementById('checkout').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 160);
}

// ─────────────────────────────────────────────────────────────
//  PAYMENT — Paystack → confirm with Edge Function
// ─────────────────────────────────────────────────────────────
function initiatePayment() {
  const name  = document.getElementById('payerName').value.trim();
  const email = document.getElementById('payerEmail').value.trim();

  if (!name || !email)         { showToast('Please fill in your name and email.', 'error'); return; }
  if (!email.includes('@'))    { showToast('Please enter a valid email.', 'error'); return; }
  if (!currentUser)            { showToast('Please sign in first.', 'error'); openAuthModal('login'); return; }

  const btn = document.getElementById('payBtn');
  btn.disabled    = true;
  btn.textContent = 'Opening Paystack…';

  PaystackPop.setup({
    key:      PAYSTACK_PUB_KEY,
    email,
    amount:   selectedPlan.price * 100,
    currency: 'NGN',
    ref:      'SC_' + Date.now(),
    metadata: {
      custom_fields: [
        { display_name: 'Name',  variable_name: 'name',  value: name },
        { display_name: 'Plan',  variable_name: 'plan',  value: selectedPlan.name }
      ]
    },
    callback(response) {
      btn.disabled    = false;
      btn.innerHTML   = '🔒 Pay & Start Building';
      paystackRef     = response.reference;

      showToast('Payment received! Confirming…', 'success');
      // Paystack requires a sync callback — kick off async work separately
      confirmPayment(paystackRef);
    },
    onClose() {
      btn.disabled    = false;
      btn.innerHTML   = '🔒 Pay & Start Building';
      showToast('Payment window closed.', 'error');
    }
  }).openIframe();
}

async function confirmPayment(ref) {
  try {
    const res  = await callEdgeFunction('confirm-payment', {
      paystackRef: ref,
      planType:    selectedPlan.type,
      planName:    selectedPlan.name,
      amount:      selectedPlan.price
    });

    if (!res.success) {
      showToast('Payment confirmation failed: ' + res.error, 'error');
      return;
    }

    showToast('Payment confirmed ✓', 'success');
    launchBuilder();

  } catch (err) {
    showToast('Could not confirm payment. Please contact support.', 'error');
    console.error('confirmPayment error:', err);
  }
}

function launchBuilder() {
  document.getElementById('checkout').style.display = 'none';
  document.getElementById('builder').style.display  = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─────────────────────────────────────────────────────────────
//  BUILDER STEPS
// ─────────────────────────────────────────────────────────────
function goStep(step) {
  if (step > currentStep) {
    if (currentStep === 1 && !selectedType) {
      showToast('Please select a page type.', 'error'); return;
    }
    if (currentStep === 2 && !document.getElementById('b_name').value.trim()) {
      showToast('Please enter your business or product name.', 'error'); return;
    }
  }

  document.getElementById('bs-' + currentStep).classList.remove('active');
  const oldDot = document.getElementById('si-' + currentStep);
  oldDot.classList.remove('active');
  oldDot.classList.add('done');
  oldDot.querySelector('.step-dot').innerHTML = '✓';

  currentStep = step;
  document.getElementById('bs-' + currentStep).classList.add('active');
  document.getElementById('si-' + currentStep).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectType(card) {
  document.querySelectorAll('#bs-1 .type-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedType = card.dataset.type;
}

function selectStyle(card) {
  document.querySelectorAll('[data-style]').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedStyle = card.dataset.style;
}

function selectColor(swatch) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  swatch.classList.add('selected');
  selectedColor = swatch.dataset.color;
}

function setCustomColor(val) {
  selectedColor = val;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
}

// ─────────────────────────────────────────────────────────────
//  GENERATION — calls Edge Function
// ─────────────────────────────────────────────────────────────
async function generateSite() {
  if (!selectedStyle) { showToast('Please pick a design style.', 'error'); return; }
  if (!currentUser)   { showToast('Please sign in first.', 'error'); openAuthModal('login'); return; }
  if (!paystackRef)   { showToast('No payment found. Please complete payment first.', 'error'); return; }

  const userData = {
    type:        selectedType || 'business',
    name:        document.getElementById('b_name').value.trim(),
    tagline:     document.getElementById('b_tagline').value.trim(),
    description: document.getElementById('b_desc').value.trim(),
    audience:    document.getElementById('b_audience').value.trim(),
    cta:         document.getElementById('b_cta').value.trim(),
    phone:       document.getElementById('b_phone').value.trim(),
    email:       document.getElementById('b_email').value.trim(),
    color:       selectedColor,
    style:       selectedStyle,
    sections:    Array.from(document.querySelectorAll('.section-check:checked')).map(cb => cb.value),
    extras:      document.getElementById('b_extras').value.trim()
  };

  document.getElementById('builder').style.display    = 'none';
  document.getElementById('generating').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  animateGenSteps();

  try {
    const res = await callEdgeFunction('generate-page', { paystackRef, userData });

    if (!res.success) throw new Error(res.error || 'Generation failed');

    generatedHTML = res.html;
    setTimeout(() => showResult(res.html), 11000);

  } catch (err) {
    console.error('generateSite error:', err);
    showToast('Generation failed: ' + err.message, 'error');
    setTimeout(() => {
      document.getElementById('generating').style.display = 'none';
      document.getElementById('builder').style.display    = 'block';
    }, 2000);
  }
}

function animateGenSteps() {
  const ids    = ['gs-1','gs-2','gs-3','gs-4','gs-5'];
  const delays = [0, 2200, 4600, 7000, 9200];
  ids.forEach((id, i) => {
    setTimeout(() => {
      if (i > 0) {
        document.getElementById(ids[i-1]).classList.remove('active');
        document.getElementById(ids[i-1]).classList.add('done');
      }
      document.getElementById(id).classList.add('active');
    }, delays[i]);
  });
}

// ─────────────────────────────────────────────────────────────
//  SUPABASE EDGE FUNCTION HELPER
// ─────────────────────────────────────────────────────────────
async function callEdgeFunction(fnName, body) {
  // Always get a fresh session from Supabase storage
  const { data: { session: freshSession }, error: sessionError } = await sb.auth.getSession();

  if (sessionError || !freshSession) {
    // Try a refresh as fallback
    const { data: refreshData } = await sb.auth.refreshSession();
    if (!refreshData?.session) {
      openAuthModal('login');
      throw new Error('Not authenticated — please sign in and try again.');
    }
    currentSession = refreshData.session;
    currentUser    = refreshData.session.user;
  } else {
    currentSession = freshSession;
    currentUser    = freshSession.user;
  }

  const token = currentSession.access_token;
  console.log('[callEdgeFunction]', fnName, 'token prefix:', token?.slice(0, 20));

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey':        SUPABASE_ANON
    },
    body: JSON.stringify(body)
  });

  console.log('[callEdgeFunction]', fnName, 'status:', res.status);

  if (res.status === 401) {
    const errBody = await res.text();
    console.error('[callEdgeFunction] 401 body:', errBody);
    showToast('Session expired. Please sign in again.', 'error');
    openAuthModal('login');
    throw new Error('Session expired');
  }

  return res.json();
}

// ─────────────────────────────────────────────────────────────
//  RESULT
// ─────────────────────────────────────────────────────────────
function showResult(html) {
  document.getElementById('generating').style.display = 'none';
  document.getElementById('result').style.display     = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const frame = document.getElementById('previewFrame');
  const doc   = frame.contentDocument || frame.contentWindow.document;
  doc.open(); doc.write(html); doc.close();

  const name = document.getElementById('b_name').value.trim() || 'my-page';
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  document.getElementById('previewUrl').textContent = slug + '.html';

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const btn  = document.getElementById('downloadBtn');
  btn.href     = url;
  btn.download = slug + '.html';

  document.getElementById('codeBlock').textContent = html;
  showToast('Your landing page is ready! 🎉', 'success');
}

function toggleCode() {
  const block = document.getElementById('codeBlock');
  const btn   = document.querySelector('.code-toggle');
  const show  = block.style.display !== 'block';
  block.style.display = show ? 'block' : 'none';
  btn.textContent     = show ? 'Hide HTML Code' : 'View HTML Code';
}

function openFullPreview() {
  const blob = new Blob([generatedHTML], { type: 'text/html' });
  window.open(URL.createObjectURL(blob), '_blank');
}

function startOver() { location.reload(); }

// ─────────────────────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 4000);
}

// ─────────────────────────────────────────────────────────────
//  SECTION TOGGLE (also called inline from HTML)
// ─────────────────────────────────────────────────────────────
function toggleSection(label) {
  const cb = label.querySelector('input[type="checkbox"]');
  cb.checked = !cb.checked;
  label.classList.toggle('checked', cb.checked);
}

// ─────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────
window.addEventListener('load', async () => {
  ['checkout', 'builder', 'generating', 'result'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });

  // Restore session if user was already logged in
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser    = session.user;
    currentSession = session;
    updateAuthUI();
  }
});