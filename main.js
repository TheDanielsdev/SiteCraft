// SiteCraft — main.js v3

const SUPABASE_URL     = 'https://zmmrersjvlapqhfndlno.supabase.co';
const SUPABASE_ANON    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbXJlcnNqdmxhcHFoZm5kbG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNzg0OTAsImV4cCI6MjA4Nzk1NDQ5MH0.neynEzGdJsjuH5RE_vtcY1TJ2kgspyBAmgjTF2ItGMI';
const PAYSTACK_PUB_KEY = 'pk_test_0382ed3e2734cca81d7d4a3c832d7457bcf9c5da';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// State
let currentUser    = null;
let currentSession = null;
let selectedPlan   = null;
let currentStep    = 1;
let selectedColor  = '#2563eb';
let selectedStyle  = '';
let selectedType   = '';
let generatedHTML  = '';
let paystackRef    = null;
let pendingPlan    = null;

// ── AUTH STATE ────────────────────────────────────────────────
sb.auth.onAuthStateChange((_event, session) => {
  currentSession = session;
  currentUser    = session?.user ?? null;
  updateAuthUI();
});

function updateAuthUI() {
  const userInfo         = document.getElementById('userInfo');
  const authBtns         = document.getElementById('authBtns');
  const signOutBtn       = document.getElementById('signOutBtn');
  const dashBtn          = document.getElementById('dashBtn');
  const mobileProfileBtn = document.getElementById('mobileProfileBtn');
  if (!userInfo) return;

  if (currentUser) {
    const name = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
    userInfo.textContent          = '👤 ' + name;
    userInfo.style.display        = 'inline-block';
    authBtns.style.display        = 'none';
    signOutBtn.style.display      = 'inline-block';
    if (dashBtn)          dashBtn.style.display          = 'inline-block';
    if (mobileProfileBtn) mobileProfileBtn.style.display = 'inline-block';
  } else {
    userInfo.style.display        = 'none';
    authBtns.style.display        = 'flex';
    signOutBtn.style.display      = 'none';
    if (dashBtn)          dashBtn.style.display          = 'none';
    if (mobileProfileBtn) mobileProfileBtn.style.display = 'none';
  }
}

// ── AUTH MODAL ────────────────────────────────────────────────
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
  document.getElementById('authModalTitle').textContent    = isLogin ? 'Welcome back' : 'Create your account';
  document.getElementById('authModalSubtitle').textContent = isLogin
    ? 'Sign in to your SiteCraft account to build and manage your landing pages.'
    : 'Join Nigerian businesses already using SiteCraft.';
  document.getElementById('authSubmitBtn').textContent     = isLogin ? 'Sign In' : 'Create Account';
  document.getElementById('authSwitchText').textContent    = isLogin ? "Don't have an account?" : 'Already have an account?';
  document.getElementById('authSwitchLink').textContent    = isLogin ? 'Sign up free' : 'Sign in';
  document.getElementById('authSwitchLink').onclick        = () => setAuthMode(isLogin ? 'signup' : 'login');
  document.getElementById('authSubmitBtn').onclick         = isLogin ? handleLogin : handleSignup;
  document.getElementById('authNameGroup').style.display   = isLogin ? 'none' : 'block';
  document.getElementById('authPromoGroup').style.display  = isLogin ? 'none' : 'block';
  const pw = document.getElementById('authPassword');
  if (pw) pw.setAttribute('autocomplete', isLogin ? 'current-password' : 'new-password');
  clearAuthError();
}

async function handleSignup() {
  const email    = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const name     = document.getElementById('authName').value.trim();
  const promoOptIn = document.getElementById('authPromoOptIn')?.checked ?? true;
  if (!email || !password) { setAuthError('Please fill in all fields.'); return; }
  if (password.length < 6) { setAuthError('Password must be at least 6 characters.'); return; }
  setAuthLoading(true);
  const { error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name: name, promo_opt_in: promoOptIn } }
  });
  setAuthLoading(false);
  if (error) { setAuthError(error.message); return; }
  sendWelcomeEmail(email, name).catch(() => {});
  closeAuthModal();
  showToast('Account created! Welcome to SiteCraft 🎉', 'success');
  if (pendingPlan) setTimeout(() => continueToPendingPlan(), 400);
}

async function handleLogin() {
  const email    = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (!email || !password) { setAuthError('Please enter your email and password.'); return; }
  setAuthLoading(true);
  const { error } = await sb.auth.signInWithPassword({ email, password });
  setAuthLoading(false);
  if (error) { setAuthError('Incorrect email or password. Please try again.'); return; }
  closeAuthModal();
  showToast('Welcome back! 👋', 'success');
  if (pendingPlan) setTimeout(() => continueToPendingPlan(), 400);
}

async function handleSignOut() {
  await sb.auth.signOut();
  location.reload();
}

// ── GOOGLE SIGN IN ────────────────────────────────────────────
async function handleGoogleSignIn() {
  // Build exact redirect URL — strips any existing hash/query so Supabase token lands cleanly
  const url  = window.location.href;
  const base = url.split('#')[0].split('?')[0];
  // Ensure trailing slash for GitHub Pages compatibility
  const redirectTo = base.endsWith('/') ? base : base + '/';
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, queryParams: { prompt: 'select_account' } }
  });
  if (error) setAuthError('Google sign-in failed. Please try again.');
}

// ── PASSWORD TOGGLE ───────────────────────────────────────────
function togglePassword(inputId, btn) {
  const input  = document.getElementById(inputId);
  const eyeShow = btn.querySelector('.eye-show');
  const eyeHide = btn.querySelector('.eye-hide');
  const isHidden = input.type === 'password';
  input.type             = isHidden ? 'text'  : 'password';
  eyeShow.style.display  = isHidden ? 'none'  : 'block';
  eyeHide.style.display  = isHidden ? 'block' : 'none';
}

function continueToPendingPlan() {
  if (!pendingPlan) return;
  selectedPlan = pendingPlan;
  pendingPlan  = null;
  document.getElementById('checkoutPlanName').textContent  = selectedPlan.name + ' Landing Page';
  document.getElementById('checkoutPlanPrice').textContent = '₦' + selectedPlan.price.toLocaleString();
  document.getElementById('payerEmail').value              = currentUser.email;
  document.getElementById('landing').style.display  = 'none';
  document.getElementById('pricing').style.display  = 'none';
  document.getElementById('checkout').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg; el.style.display = 'block';
}
function clearAuthError() {
  const el = document.getElementById('authError');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}
function setAuthLoading(loading) {
  const btn = document.getElementById('authSubmitBtn');
  btn.disabled    = loading;
  btn.textContent = loading ? 'Please wait…' : btn.textContent;
}

// ── WELCOME EMAIL ─────────────────────────────────────────────
async function sendWelcomeEmail(email, name) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-welcome-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON },
      body: JSON.stringify({ email, name })
    });
  } catch (_) {}
}

// ── DASHBOARD ─────────────────────────────────────────────────
async function openDashboard() {
  if (!currentUser) { openAuthModal('login'); return; }
  document.getElementById('dashboardModal').classList.add('open');
  await loadDashboard();
}
function closeDashboard() {
  document.getElementById('dashboardModal').classList.remove('open');
}
async function loadDashboard() {
  const list = document.getElementById('dashboardList');
  list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--muted);">Loading your pages…</div>';
  const { data, error } = await sb
    .from('generated_pages')
    .select('*, orders(plan_name, amount, paid_at)')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error || !data?.length) {
    list.innerHTML = `<div style="text-align:center;padding:48px 24px;">
      <div style="font-size:2.5rem;margin-bottom:16px;">📄</div>
      <div style="font-weight:700;margin-bottom:8px;">No pages yet</div>
      <div style="color:var(--muted);font-size:0.875rem;">Your generated landing pages will appear here.</div>
    </div>`; return;
  }
  window._dashPages = data;
  list.innerHTML = data.map(page => {
    const order  = page.orders;
    const date   = new Date(page.created_at).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' });
    const amount = order ? '₦' + order.amount.toLocaleString() : '—';
    const plan   = order?.plan_name || '—';
    return `<div class="dash-item">
      <div class="dash-item-info">
        <div class="dash-item-name">${page.business_name || 'Untitled Page'}</div>
        <div class="dash-item-meta">${page.page_type || 'Landing Page'} · ${plan} · ${amount} · ${date}</div>
      </div>
      <div class="dash-item-actions">
        <button class="dash-btn" onclick="previewDashPage('${page.id}')">Preview</button>
        <button class="dash-btn dash-btn-primary" onclick="downloadDashPage('${page.id}', '${(page.business_name||'page').replace(/'/g,'&apos;')}')">Download</button>
      </div>
    </div>`;
  }).join('');
}
function previewDashPage(id) {
  const page = window._dashPages?.find(p => p.id === id);
  if (!page) return;
  window.open(URL.createObjectURL(new Blob([page.html], { type: 'text/html' })), '_blank');
}
function downloadDashPage(id, name) {
  const page = window._dashPages?.find(p => p.id === id);
  if (!page) return;
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([page.html], { type: 'text/html' }));
  a.download = slug + '.html'; a.click();
}

// ── NAVIGATION ────────────────────────────────────────────────
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

// ── PLAN SELECTION ────────────────────────────────────────────
function selectPlan(card) {
  const plan = {
    type:  card.dataset.plan,
    price: parseInt(card.dataset.price),
    name:  card.querySelector('.plan-name').textContent
  };
  if (!currentUser) {
    pendingPlan = plan;
    showToast('Create a free account to continue.', 'success');
    openAuthModal('signup'); return;
  }
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedPlan = plan;
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

// ── PAYMENT ───────────────────────────────────────────────────
function initiatePayment() {
  const name  = document.getElementById('payerName').value.trim();
  const email = document.getElementById('payerEmail').value.trim();
  if (!name || !email)      { showToast('Please fill in your name and email.', 'error'); return; }
  if (!email.includes('@')) { showToast('Please enter a valid email address.', 'error'); return; }
  if (!currentUser)         { openAuthModal('login'); return; }
  const btn = document.getElementById('payBtn');
  btn.disabled    = true;
  btn.textContent = 'Opening Paystack…';
  PaystackPop.setup({
    key: PAYSTACK_PUB_KEY, email,
    amount: selectedPlan.price * 100, currency: 'NGN',
    ref: 'SC_' + Date.now(),
    metadata: { custom_fields: [
      { display_name: 'Name', variable_name: 'name', value: name },
      { display_name: 'Plan', variable_name: 'plan', value: selectedPlan.name }
    ]},
    callback(response) {
      btn.disabled  = false;
      btn.innerHTML = '🔒 Pay & Start Building';
      paystackRef   = response.reference;
      showToast('Payment received! Confirming…', 'success');
      confirmPayment(paystackRef);
    },
    onClose() {
      btn.disabled  = false;
      btn.innerHTML = '🔒 Pay & Start Building';
      showToast('Payment window closed.', 'error');
    }
  }).openIframe();
}

async function confirmPayment(ref) {
  try {
    const res = await callEdgeFunction('confirm-payment', {
      paystackRef: ref, planType: selectedPlan.type,
      planName: selectedPlan.name, amount: selectedPlan.price
    });
    if (!res.success) { showToast('Payment confirmation failed: ' + res.error, 'error'); return; }
    showToast("Payment confirmed ✓ Let's build your page!", 'success');
    launchBuilder();
  } catch (err) {
    showToast('Could not confirm payment. Please contact support.', 'error');
  }
}

function launchBuilder() {
  document.getElementById('checkout').style.display = 'none';
  document.getElementById('builder').style.display  = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── BUILDER STEPS ─────────────────────────────────────────────
function goStep(step) {
  if (step > currentStep) {
    if (currentStep === 1 && !selectedType) { showToast('Please select a page type.', 'error'); return; }
    if (currentStep === 2 && !document.getElementById('b_name').value.trim()) { showToast('Please enter your business name.', 'error'); return; }
  }
  document.getElementById('bs-' + currentStep).classList.remove('active');
  const dot = document.getElementById('si-' + currentStep);
  dot.classList.remove('active'); dot.classList.add('done');
  dot.querySelector('.step-dot').innerHTML = '✓';
  currentStep = step;
  document.getElementById('bs-' + currentStep).classList.add('active');
  document.getElementById('si-' + currentStep).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function selectType(card) {
  document.querySelectorAll('#bs-1 .type-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected'); selectedType = card.dataset.type;
}
function selectStyle(card) {
  document.querySelectorAll('[data-style]').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected'); selectedStyle = card.dataset.style;
}
function selectColor(swatch) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  swatch.classList.add('selected'); selectedColor = swatch.dataset.color;
}
function setCustomColor(val) {
  selectedColor = val;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
}

// ── GENERATION ────────────────────────────────────────────────
async function generateSite() {
  if (!selectedStyle) { showToast('Please pick a design style.', 'error'); return; }
  if (!currentUser)   { openAuthModal('login'); return; }
  if (!paystackRef)   { showToast('No payment found. Please complete payment first.', 'error'); return; }
  const getVal = id => document.getElementById(id)?.value.trim() ?? '';
  const userData = {
    type: selectedType || 'business', name: getVal('b_name'), tagline: getVal('b_tagline'),
    description: getVal('b_desc'), audience: getVal('b_audience'), cta: getVal('b_cta'),
    phone: getVal('b_phone'), email: getVal('b_email'), color: selectedColor,
    style: selectedStyle, sections: [], extras: getVal('b_extras')
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
  const ids = ['gs-1','gs-2','gs-3','gs-4'];
  const delays = [0, 2200, 4600, 7000];
  ids.forEach((id, i) => {
    setTimeout(() => {
      if (i > 0) { document.getElementById(ids[i-1]).classList.remove('active'); document.getElementById(ids[i-1]).classList.add('done'); }
      document.getElementById(id).classList.add('active');
    }, delays[i]);
  });
}

// ── EDGE FUNCTION HELPER ──────────────────────────────────────
async function callEdgeFunction(fnName, body) {
  const { data: { session: fresh } } = await sb.auth.getSession();
  let session = fresh;
  if (!session) {
    const { data: r } = await sb.auth.refreshSession();
    session = r?.session ?? null;
    if (session) { currentSession = session; currentUser = session.user; }
  }
  if (!session) { openAuthModal('login'); throw new Error('Not authenticated'); }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': SUPABASE_ANON },
    body: JSON.stringify(body)
  });
  if (res.status === 401) { showToast('Session expired. Please sign in again.', 'error'); openAuthModal('login'); throw new Error('Session expired'); }
  return res.json();
}

// ── RESULT ────────────────────────────────────────────────────
function showResult(html) {
  document.getElementById('generating').style.display = 'none';
  document.getElementById('result').style.display     = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const frame = document.getElementById('previewFrame');
  const doc   = frame.contentDocument || frame.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  const name = document.getElementById('b_name')?.value.trim() || 'my-page';
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  document.getElementById('previewUrl').textContent = slug + '.html';
  const blob = new Blob([html], { type: 'text/html' });
  const btn  = document.getElementById('downloadBtn');
  btn.href = URL.createObjectURL(blob); btn.download = slug + '.html';
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
  window.open(URL.createObjectURL(new Blob([generatedHTML], { type: 'text/html' })), '_blank');
}
function startOver() { location.reload(); }

// ── TOAST ─────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 4000);
}

// ── INIT ──────────────────────────────────────────────────────
window.addEventListener('load', async () => {
  ['checkout', 'builder', 'generating', 'result'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });

  // Handle OAuth redirect — Supabase puts tokens in the URL hash
  // detectSessionInUrl:true handles this, but we need to wait for it
  const hash = window.location.hash;
  if (hash && hash.includes('access_token')) {
    // Let Supabase parse the hash and establish the session
    const { data: { session }, error } = await sb.auth.getSession();
    if (session) {
      currentSession = session;
      currentUser    = session.user;
      updateAuthUI();
      showToast('Signed in with Google! Welcome, ' + (session.user.user_metadata?.full_name || session.user.email.split('@')[0]) + ' 👋', 'success');
    }
    // Clean the URL — remove the ugly token hash
    history.replaceState(null, '', window.location.pathname);
  } else {
    const { data: { session } } = await sb.auth.getSession();
    if (session) { currentSession = session; currentUser = session.user; updateAuthUI(); }
  }
});