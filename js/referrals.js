// Local invite-link helpers. Referral attribution waits for a verified player identity.
(() => {
  const storageKey = 'bottlegame.inviteCode';
  function newCode() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replaceAll('-', '');
    if (globalThis.crypto?.getRandomValues) return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
  function getOrCreateLocalCode() {
    try {
      let code = localStorage.getItem(storageKey);
      if (!code) {
        code = newCode();
        localStorage.setItem(storageKey, code);
      }
      return code;
    } catch {
      return newCode();
    }
  }
  function buildInviteLink(base, code, botUrl = '') {
    if (botUrl) {
      const telegram = new URL(botUrl);
      telegram.searchParams.set('startapp', `ref_${code}`);
      return telegram.href;
    }
    const link = new URL(base);
    link.search = '';
    link.hash = '';
    link.searchParams.set('ref', code);
    return link.href;
  }
  function parseInviteCode(search = '', startParam = '') {
    const fromQuery = new URLSearchParams(search).get('ref') || '';
    const value = startParam.startsWith('ref_') ? startParam.slice(4) : fromQuery;
    return /^[a-f0-9]{24,32}$/i.test(value) ? value : '';
  }
  window.GameReferrals = Object.freeze({ getOrCreateLocalCode, buildInviteLink, parseInviteCode });
})();
