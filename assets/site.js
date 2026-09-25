(() => {
'use strict';

const GA_MEASUREMENT_ID = 'G-BF6QHXXEL3';
// TODO: Apps Script 웹 앱 배포 후 나온 /exec URL로 교체하세요.
const BRIDGE_URL = 'https://script.google.com/macros/s/AKfycbwKXYGkVmmwmf3Bkir_1VZ13LD4xNC2eLiYAfbFhrROCZGPwFpY8tNKQaT-Sj6TecDljQ/exec';
// Apps Script 프로젝트의 Script Properties에 설정한 FSC_BRIDGE_SECRET과 반드시 같은 값이어야 합니다.
const BRIDGE_SECRET = '562a6f687db32fba82c60935cfe6ca04d4ef61b4405ba4633232cf734ef69156';

window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
window.gtag = window.gtag || gtag;

if (GA_MEASUREMENT_ID && !GA_MEASUREMENT_ID.includes('XXXX')) {
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
  document.head.appendChild(s);
  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID);
}

function trackEvent(type, params) {
  try { gtag('event', type, params || {}); } catch { /* GA 미설정 시 무시 */ }
}

function base64UrlNoPad(buf) {
  let bin = '';
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signBridgeMessage(message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(BRIDGE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return base64UrlNoPad(sig);
}

// Apps Script의 doPost 브리지(bridge)가 요구하는 서명된 envelope 형식으로 감싸서 전송.
async function callBridge(action, payload) {
  if (!BRIDGE_URL || BRIDGE_URL.includes('PASTE_')) {
    throw new Error('SAVE_ERROR');
  }
  const payloadJson = JSON.stringify(payload);
  const nonce = crypto.randomUUID();
  const issuedAt = Date.now();
  const message = 'bridge|' + action + '|' + issuedAt + '|' + nonce + '|' + payloadJson;
  const signature = await signBridgeMessage(message);
  const envelope = { action, payloadJson, nonce, issuedAt, signature };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  return fetch(BRIDGE_URL, { method: 'POST', body: JSON.stringify(envelope), signal: controller.signal })
    .then(async response => {
      let result;
      try { result = await response.json(); } catch { throw new Error('SAVE_ERROR'); }
      if (!response.ok || !result?.ok) throw new Error(result?.code || 'SAVE_ERROR');
      return result;
    })
    .catch(error => { if (error.name === 'AbortError') throw new Error('TIMEOUT'); throw error; })
    .finally(() => clearTimeout(timer));
}

function submitToSheet(payload) {
  return callBridge('submitApplication', payload);
}

window.FSC = window.FSC || {};
window.FSC.trackEvent = trackEvent;
window.FSC.submitToSheet = submitToSheet;

// 3개 서비스 랜딩페이지가 공유하는 히어로/신청폼 로직. 페이지별 DATA만 다름.
window.FSC.initServicePage = function initServicePage(DATA) {
  const B = window.FSC_BOOT || {};
  const PREVIEW = B.mode !== 'live';
  const $ = s => document.querySelector(s);
  const query = new URLSearchParams(location.search);
  const current = Object.keys(DATA)[0]; // 빌드 시 고정. 쿼리 파라미터로 전환되지 않음.
  const id = () => globalThis.crypto?.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2, '0')).join('');
  let visit = B.visitId || id(), requestId = id(), requestEmail = '', pending = false;
  const focusStack = new Map(), campaign = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    const v = String(B.campaign?.[k] || query.get(k) || '');
    campaign[k] = /^[\w.\- ]{0,80}$/.test(v) ? v : '';
  }
  const base = () => ({ service: current, visitId: visit, token: B.token || '', campaign, device: innerWidth < 681 ? 'mobile' : innerWidth < 1025 ? 'tablet' : 'desktop', version: B.version || '1.2' });
  const seen = new Set();
  function event(type) {
    if (seen.has(type)) return;
    seen.add(type);
    trackEvent(type, { service: current, campaign, device: base().device });
  }

  function render() {
    const d = DATA[current];
    document.title = d.name + ' · 얼리버드 사전신청';
    for (const [sel, key] of Object.entries({ '#brandName': 'name', '#kicker': 'kicker', '#description': 'description', '#ctaText': 'cta', '#readinessNote': 'note', '#questionLabel': 'question' })) $(sel).textContent = d[key];
    $('#heroTitle').innerHTML = d.title;
    $('#heroImage').alt = d.name + ' 서비스 예시 일러스트';
    $('#serviceLabels').replaceChildren(...d.labels.map(x => { const e = document.createElement('span'); e.textContent = x; return e; }));
    $('#features').innerHTML = d.features.map((x, i) => '<article class="feature"><div class="num">0' + (i + 1) + '</div><h3>' + x[0] + '</h3><p>' + x[1] + '</p></article>').join('');
    $('#formTitle').textContent = d.name + ' 먼저 만나기';
    $('#chips').replaceChildren(...[{ value: '', label: '응답 안 함' }, ...d.choices].map((opt, i) => { const l = document.createElement('label'); l.className = 'chip'; const a = document.createElement('input'); a.type = 'radio'; a.name = 'answer'; a.value = opt.value; a.defaultChecked = i === 0; const s = document.createElement('span'); s.textContent = opt.label; l.append(a, s); return l; }));
    $('#form').reset(); $('#questionDetail').open = false; $('#answerConsentWrap').hidden = true; $('#answerConsent').required = false; $('#formError').hidden = true; $('#formBody').hidden = false; $('#successBody').hidden = true;
    for (const sel of ['#previewFormNote', '#previewBanner']) $(sel).hidden = !PREVIEW;
    $('#contactText').textContent = B.contactEmail || '공개 전 운영 문의 이메일을 설정합니다.'; $('#contactLink').hidden = !B.contactEmail; if (B.contactEmail) $('#contactLink').href = 'mailto:' + B.contactEmail;
    $('#operatorText').textContent = B.operator || 'FSC MVP 프로젝트 팀';
    for (const e of document.querySelectorAll('.retentionDays')) e.textContent = String(B.retentionDays || 90);
    $('#configBanner').hidden = PREVIEW || B.ready; $('#openForm').disabled = !PREVIEW && !B.ready;
  }
  function openModal(d) { focusStack.set(d, document.activeElement); d.showModal(); document.body.style.overflow = 'hidden'; }
  function closeModal(d) { if (pending && d.id === 'signupModal') return; d.close(); }
  for (const d of document.querySelectorAll('dialog')) {
    d.addEventListener('close', () => { if (!document.querySelector('dialog[open]')) document.body.style.overflow = ''; const f = focusStack.get(d); if (f?.isConnected) f.focus(); });
    d.addEventListener('cancel', e => { if (pending && d.id === 'signupModal') e.preventDefault(); });
    d.addEventListener('click', e => { if (e.target !== d) return; const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeModal(d); });
  }
  for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => closeModal(document.getElementById(b.dataset.close));
  $('#openForm').onclick = () => { event('cta_click'); openModal($('#signupModal')); setTimeout(() => { if (!$('#formBody').hidden) $('#email').focus(); }, 80); };
  for (const b of document.querySelectorAll('[data-privacy]')) b.onclick = () => openModal($('#privacyModal'));
  $('#chips').addEventListener('change', () => { const answered = Boolean(new FormData($('#form')).get('answer')); $('#answerConsentWrap').hidden = !answered; $('#answerConsent').required = answered; if (!answered) $('#answerConsent').checked = false; });
  $('#form').addEventListener('submit', async e => {
    e.preventDefault(); if (pending || !$('#form').reportValidity()) return;
    const email = $('#email').value.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) { error('이메일 주소를 다시 확인해주세요.'); $('#email').focus(); return; }
    const canonicalEmail = email.toLowerCase(); if (requestEmail && requestEmail !== canonicalEmail) requestId = id(); requestEmail = canonicalEmail;
    const data = new FormData($('#form'));
    const payload = { ...base(), requestId, email, answer: String(data.get('answer') || ''), answerConsent: $('#answerConsent').checked, consent: $('#consent').checked, ageConfirmed: $('#age').checked, consentVersion: '1.1', company: String(data.get('company') || '') };
    $('#formError').hidden = true; if (PREVIEW) { success(true); return; }
    pending = true; $('#submitButton').disabled = true; $('#submitText').textContent = '신청을 저장하고 있어요';
    try { const r = await submitToSheet(payload); if (!r?.ok) throw new Error(r?.code || 'SAVE_ERROR'); success(false); event('signup_submit'); }
    catch (err) { error(err.message === 'TIMEOUT' ? '저장 결과 확인이 지연되고 있어요. 잠시 후 다시 시도해주세요. 같은 이메일은 중복으로 접수되지 않습니다.' : err.message === 'RATE_LIMIT' ? '신청 요청이 많습니다. 잠시 후 다시 시도해주세요.' : err.message === 'NOT_READY' ? '아직 신청을 받고 있지 않습니다. 잠시 후 다시 방문해주세요.' : err.message === 'BAD_TOKEN' ? '페이지를 새로고침한 후 다시 신청해주세요.' : '저장을 완료했는지 확인하지 못했습니다. 입력 내용을 유지했으니 잠시 후 다시 시도해주세요.'); }
    finally { pending = false; $('#submitButton').disabled = false; $('#submitText').textContent = '얼리버드 신청 완료하기'; }
  });
  function error(s) { $('#formError').textContent = s; $('#formError').hidden = false; }
  function success(preview) { $('#formBody').hidden = true; $('#successBody').hidden = false; $('#successTitle').textContent = preview ? '신청 완료 화면 미리보기' : '얼리버드 신청을 받았어요'; $('#successDescription').textContent = preview ? '검토용 화면입니다.\n입력한 이메일과 답변은 전송·저장되지 않았습니다.' : DATA[current].name + '의 출시 준비가 되면\n남겨주신 이메일로 소식을 안내할 예정입니다.\n현재 이용료는 청구되지 않습니다.'; $('#form').reset(); $('#successClose').focus(); }

  if (document.modelContext?.registerTool) {
    const lifecycle = new AbortController();
    addEventListener('pagehide', () => lifecycle.abort(), { once: true });
    try {
      Promise.resolve(document.modelContext.registerTool({
        name: 'start_earlybird_application', title: '사전신청 창 열기',
        description: '현재 서비스의 신청창을 엽니다. 이메일 입력, 동의, 제출 또는 저장은 하지 않습니다.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) { if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('INVALID_INPUT'); if ($('#openForm').disabled) throw new Error('NOT_READY'); if (!$('#signupModal').open) $('#openForm').click(); return { service: current, opened: $('#signupModal').open, mode: PREVIEW ? 'visual_preview' : 'live' }; }
      }, { signal: lifecycle.signal })).catch(() => {});
    } catch {}
  }

  render(); event('landing_view');
};
})();
