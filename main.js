// ─────── CONFIG ───────
let CONFIG = {
    paystackKey: '',
    anthropicKey: ''
  };
  
  let selectedPlan = null;
  let currentBuilderStep = 1;
  let selectedColor = '#2563eb';
  let selectedStyle = '';
  let selectedType = '';
  let generatedHTML = '';
  
  // ─────── CONFIG MODAL ───────
  function saveConfig() {
    CONFIG.paystackKey = document.getElementById('paystackKey').value.trim();
    CONFIG.anthropicKey = document.getElementById('anthropicKey').value.trim();
    document.getElementById('configModal').classList.remove('open');
    showToast('Configuration saved!', 'success');
  }
  
  function closeConfig() {
    document.getElementById('configModal').classList.remove('open');
  }
  
  // ─────── NAVIGATION ───────
  function scrollToPricing() {
    document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' });
  }
  
  function goBack(from, to) {
    document.getElementById(from).style.display = 'none';
    if (to === 'pricing') {
      document.getElementById('landing').style.display = 'flex';
      document.getElementById('pricing').style.display = 'block';
      setTimeout(() => document.getElementById('pricing').scrollIntoView({ behavior: 'smooth' }), 100);
    } else {
      document.getElementById(to).style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
  
  // ─────── PLAN SELECTION ───────
  function selectPlan(card) {
    document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedPlan = {
      type: card.dataset.plan,
      price: parseInt(card.dataset.price),
      name: card.querySelector('.plan-name').textContent
    };
  
    document.getElementById('checkoutPlanName').textContent = selectedPlan.name + ' Landing Page';
    document.getElementById('checkoutPlanPrice').textContent = '₦' + selectedPlan.price.toLocaleString();
  
    setTimeout(() => {
      document.getElementById('landing').style.display = 'none';
      document.getElementById('pricing').style.display = 'none';
      document.getElementById('checkout').style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 200);
  }
  
  // ─────── PAYMENT ───────
  function initiatePayment() {
    const name = document.getElementById('payerName').value.trim();
    const email = document.getElementById('payerEmail').value.trim();
  
    if (!name || !email) {
      showToast('Please fill in your name and email.', 'error');
      return;
    }
  
    if (!email.includes('@')) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }
  
    if (!CONFIG.paystackKey) {
      showToast('Demo mode: Skipping payment — configure Paystack key for real payments.', 'success');
      setTimeout(() => launchBuilder(), 1200);
      return;
    }
  
    const btn = document.getElementById('payBtn');
    btn.disabled = true;
    btn.textContent = 'Opening Paystack...';
  
    const handler = PaystackPop.setup({
      key: CONFIG.paystackKey,
      email: email,
      amount: selectedPlan.price * 100,
      currency: 'NGN',
      ref: 'SC_' + Date.now(),
      metadata: {
        custom_fields: [
          { display_name: 'Name', variable_name: 'name', value: name },
          { display_name: 'Plan', variable_name: 'plan', value: selectedPlan.name }
        ]
      },
      callback: function(response) {
        showToast('Payment successful! Ref: ' + response.reference, 'success');
        btn.disabled = false;
        btn.textContent = '🔒 Pay & Start Building';
        launchBuilder();
      },
      onClose: function() {
        btn.disabled = false;
        btn.textContent = '🔒 Pay & Start Building';
        showToast('Payment window closed.', 'error');
      }
    });
  
    handler.openIframe();
  }
  
  function launchBuilder() {
    document.getElementById('checkout').style.display = 'none';
    document.getElementById('builder').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  
  // ─────── BUILDER ───────
  function goStep(step) {
    if (step > currentBuilderStep) {
      if (currentBuilderStep === 1 && !selectedType) {
        showToast('Please select a landing page type.', 'error');
        return;
      }
      if (currentBuilderStep === 2 && !document.getElementById('b_name').value.trim()) {
        showToast('Please enter your business or product name.', 'error');
        return;
      }
    }
  
    document.getElementById('bs-' + currentBuilderStep).classList.remove('active');
    const oldDot = document.getElementById('si-' + currentBuilderStep);
    oldDot.classList.remove('active');
    oldDot.classList.add('done');
    oldDot.querySelector('.step-dot').innerHTML = '✓';
  
    currentBuilderStep = step;
    document.getElementById('bs-' + currentBuilderStep).classList.add('active');
    document.getElementById('si-' + currentBuilderStep).classList.add('active');
  
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
  
  // ─────── GENERATION ───────
  async function generateSite() {
    if (!selectedStyle) {
      showToast('Please pick a design style.', 'error');
      return;
    }
  
    const userData = {
      type: selectedType || 'product',
      name: document.getElementById('b_name').value.trim(),
      tagline: document.getElementById('b_tagline').value.trim(),
      description: document.getElementById('b_desc').value.trim(),
      audience: document.getElementById('b_audience').value.trim(),
      cta: document.getElementById('b_cta').value.trim(),
      phone: document.getElementById('b_phone').value.trim(),
      email: document.getElementById('b_email').value.trim(),
      color: selectedColor,
      style: selectedStyle,
      sections: getCheckedSections(),
      extras: document.getElementById('b_extras').value.trim()
    };
  
    document.getElementById('builder').style.display = 'none';
    document.getElementById('generating').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  
    animateGenSteps();
  
    try {
      const html = await callClaudeAPI(userData);
      generatedHTML = html;
      setTimeout(() => showResult(html), 11000);
    } catch (err) {
      console.error('Generation error:', err);
      showToast('Generation failed: ' + err.message, 'error');
      setTimeout(() => {
        document.getElementById('generating').style.display = 'none';
        document.getElementById('builder').style.display = 'block';
      }, 2000);
    }
  }
  
  function getCheckedSections() {
    return Array.from(document.querySelectorAll('.section-check:checked'))
      .map(cb => cb.value);
  }
  
  function animateGenSteps() {
    const steps = ['gs-1', 'gs-2', 'gs-3', 'gs-4', 'gs-5'];
    const delays = [0, 2200, 4500, 7000, 9200];
    steps.forEach((id, i) => {
      setTimeout(() => {
        if (i > 0) {
          document.getElementById(steps[i - 1]).classList.remove('active');
          document.getElementById(steps[i - 1]).classList.add('done');
        }
        document.getElementById(id).classList.add('active');
      }, delays[i]);
    });
  }
  
  // ─────── CLAUDE API ───────
  async function callClaudeAPI(data) {
    if (!CONFIG.anthropicKey) {
      await new Promise(r => setTimeout(r, 11000));
      throw new Error('No Anthropic API key configured. Please click "Setup Keys" and enter your key.');
    }
  
    const sectionList = data.sections.length > 0
      ? data.sections.join(', ')
      : 'Hero, About/Story, Features/Services, Social proof, CTA, Footer';
  
    const prompt = buildPrompt(data, sectionList);
  
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
  
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || 'API request failed with status ' + response.status);
    }
  
    const result = await response.json();
    let html = result.content.map(b => b.text || '').join('').trim();
  
    // Strip markdown fences if present
    html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  
    if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
      throw new Error('Claude returned unexpected output. Try again.');
    }
  
    return html;
  }
  
  function buildPrompt(data, sectionList) {
    return `You are an expert web designer and conversion rate optimization specialist. Create a stunning, high-converting landing page as a complete single HTML file.
  
  ## BRIEF
  - **Type:** ${data.type} landing page
  - **Brand/Product:** ${data.name}
  - **Tagline:** ${data.tagline || 'Create one that fits the brand'}
  - **Description:** ${data.description || 'A great ' + data.type}
  - **Target Audience:** ${data.audience || 'General consumers'}
  - **Primary CTA:** ${data.cta || 'Get Started'}
  - **Brand Color:** ${data.color}
  - **Design Style:** ${data.style}
  - **Phone:** ${data.phone || 'Not provided'}
  - **Email:** ${data.email || 'Not provided'}
  - **Sections to include:** ${sectionList}
  - **Extra requests:** ${data.extras || 'None'}
  
  ## DESIGN REQUIREMENTS
  - Single-file HTML with all CSS and minimal JS embedded
  - Brand color ${data.color} as the dominant color — use it boldly
  - ${data.style} aesthetic — commit to it fully
  - Google Fonts via @import — choose a font pair that matches the style
  - Fully mobile responsive with thoughtful breakpoints
  - Smooth scroll, subtle scroll-reveal animations using Intersection Observer
  - Sticky navigation with blur backdrop
  - Hover effects on all interactive elements
  - CSS custom properties for the color system
  
  ## LANDING PAGE STRUCTURE
  Build each of these sections with REAL, COMPELLING content (not placeholder text):
  
  1. **Navigation** — Logo (${data.name}), nav links, CTA button
  2. **Hero** — Bold headline, subheadline, primary CTA button ("${data.cta || 'Get Started'}"), secondary CTA, hero visual (CSS art / geometric shape / gradient blob — no img tags)
  3. For each section in [${sectionList}], create a compelling, well-designed section
  4. **Footer** — Logo, nav links, contact info${data.phone ? ' (📱 ' + data.phone + ')' : ''}${data.email ? ', (✉️ ' + data.email + ')' : ''}, copyright
  
  ## CONTENT RULES
  - Write REAL marketing copy based on the description — make it persuasive and specific
  - Create realistic feature names, benefit statements, and social proof
  - Use emojis sparingly and only where they add value
  - No placeholder text like "Lorem ipsum" or "Content here"
  - Numbers and specifics make copy stronger — invent plausible ones
  
  ## CODE QUALITY
  - Clean, semantic HTML5
  - CSS Grid and Flexbox for layouts
  - No external libraries except Google Fonts
  - Smooth, performant animations (transform/opacity only)
  - Images: use CSS gradients, shapes, or SVG patterns — NO <img> tags (they'd be broken)
  - All sections visually distinct but cohesive
  
  Return ONLY the complete HTML. No explanation. No markdown. No backticks. Start immediately with <!DOCTYPE html>.`;
  }
  
  // ─────── RESULT ───────
  function showResult(html) {
    document.getElementById('generating').style.display = 'none';
    document.getElementById('result').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  
    // Render preview
    const frame = document.getElementById('previewFrame');
    const doc = frame.contentDocument || frame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
  
    // Set URL bar
    const bname = document.getElementById('b_name').value.trim() || 'my-landing-page';
    const slug = bname.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    document.getElementById('previewUrl').textContent = slug + '.html';
  
    // Download link
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const downloadBtn = document.getElementById('downloadBtn');
    downloadBtn.href = url;
    downloadBtn.download = slug + '.html';
  
    // Code view
    document.getElementById('codeBlock').textContent = html;
  
    showToast('Your landing page is ready! 🎉', 'success');
  }
  
  function toggleCode() {
    const block = document.getElementById('codeBlock');
    const btn = document.querySelector('.code-toggle');
    const isVisible = block.style.display === 'block';
    block.style.display = isVisible ? 'none' : 'block';
    btn.textContent = isVisible ? 'View HTML Code' : 'Hide Code';
  }
  
  function openFullPreview() {
    const blob = new Blob([generatedHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }
  
  function startOver() {
    location.reload();
  }
  
  function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast ' + type + ' show';
    setTimeout(() => t.classList.remove('show'), 4000);
  }
  
  // ─────── INIT ───────
  window.addEventListener('load', () => {
    document.getElementById('checkout').style.display = 'none';
    document.getElementById('builder').style.display = 'none';
    document.getElementById('generating').style.display = 'none';
    document.getElementById('result').style.display = 'none';
  
    setTimeout(() => {
      if (!CONFIG.paystackKey) {
        document.getElementById('configModal').classList.add('open');
      }
    }, 1500);
  });