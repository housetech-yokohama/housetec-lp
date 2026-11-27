/* Share only the public guide URL; never include the current query or fragment. */
(() => {
  'use strict';
  const guides = {
    '/kanagawa-baikyaku.html': {
      title: '神奈川区の不動産売却ガイド｜ハウステック',
      url: 'https://housetec-lp.vercel.app/kanagawa-baikyaku.html'
    },
    '/souzoku-baikyaku.html': {
      title: '神奈川区の相続した家の売却ガイド｜ハウステック',
      url: 'https://housetec-lp.vercel.app/souzoku-baikyaku.html'
    }
  };
  const guide = guides[window.location.pathname];
  const root = document.querySelector('[data-guide-share]');
  if (!guide || !root) return;
  const input = root.querySelector('[data-guide-share-url]');
  const copyButton = root.querySelector('[data-guide-copy]');
  const shareButton = root.querySelector('[data-guide-native-share]');
  const status = root.querySelector('[data-guide-share-status]');
  if (!input || !copyButton || !shareButton || !status) return;

  input.value = guide.url;
  const manualCopy = () => {
    input.focus();
    input.select();
    status.textContent = 'URLを選択しました。長押し、またはコピー操作で保存してください。';
  };
  copyButton.hidden = false;
  copyButton.addEventListener('click', async () => {
    status.textContent = '';
    copyButton.disabled = true;
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        manualCopy();
        return;
      }
      await navigator.clipboard.writeText(guide.url);
      status.textContent = 'URLをコピーしました。メールやメッセージに貼り付けてお送りください。';
    } catch {
      manualCopy();
    } finally {
      copyButton.disabled = false;
    }
  });

  const shareData = { title: guide.title, url: guide.url };
  let canShare = typeof navigator.share === 'function';
  if (canShare && typeof navigator.canShare === 'function') {
    try {
      canShare = navigator.canShare(shareData);
    } catch {
      canShare = false;
    }
  }
  if (!canShare) return;
  shareButton.hidden = false;
  shareButton.addEventListener('click', async () => {
    status.textContent = '';
    shareButton.disabled = true;
    try {
      await navigator.share(shareData);
    } catch (error) {
      if (!error || error.name !== 'AbortError') {
        status.textContent = '共有画面を開けませんでした。URLをコピーしてお送りください。';
      }
    } finally {
      shareButton.disabled = false;
    }
  });
})();
