import { createCampaignLoader } from './atlas-runtime.mjs';

const stage = document.getElementById('atlas-map-stage');
if (stage) {
  const pill = document.getElementById('atlas-3d-mode-pill');
  const message = document.getElementById('atlas-campaign-status');
  const buttons = [pill, document.getElementById('atlas-strategic')].filter(Boolean);
  const motionMessage = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('a11y-motion');
  let state = '2d';
  let loadAttempts = 0;
  const describe = () => {
    message.textContent = state === '3d' ? (motionMessage() ? 'Campaign paused for reduced motion. Manual exploration is available.' : 'Campaign active. Select a venue to find its events.') :
      state === 'loading' ? 'Loading the campaign. The illustrated atlas remains available; choose 2D to cancel.' :
      state === 'error' ? '3D is unavailable. Use the illustrated atlas or try 3D again.' : 'Illustrated atlas. Choose 3D to load the living campaign.';
  };
  const loader = createCampaignLoader({
    // A retry also retries a previously failed network/module fetch. Shared venue
    // imports retain their canonical URL and are never bootstrapped a second time.
    load: () => {
      const retry = loadAttempts++;
      return import('./atlas3d.js' + (retry ? '?retry=' + retry : ''));
    },
    onState(next) {
      state = next;
      stage.dataset.campaignState = next;
      stage.setAttribute('aria-busy', String(next === 'loading'));
      for (const button of buttons) {
        button.setAttribute('aria-pressed', String(next === '3d'));
        button.removeAttribute('title');
        button.textContent = next === '3d' ? 'Switch to 2D map' : next === 'loading' ? 'Cancel 3D · Keep 2D' : next === 'error' ? 'Try 3D again' : 'Explore in 3D';
      }
      if (next === '2d' || next === 'error') {
        stage.classList.add('is-strategic'); stage.classList.remove('is-blending');
        stage.style.setProperty('--atlas-2d-opacity', '1'); stage.style.setProperty('--atlas-2d-landmarks', '1');
        stage.style.setProperty('--atlas-3d-opacity', '0');
        window.TG?.atlas?.set3DActive(false);
      }
      describe();
    },
    onError: () => { document.getElementById('atlas-announcement').textContent = '3D is unavailable. The illustrated map remains usable.'; },
    onChange: active => stage.dataset.campaignRequested = String(active),
  });
  buttons.forEach(button => button.addEventListener('click', () => loader.set3D(!loader.active)));
  window.addEventListener('pagehide', event => event.persisted ? loader.pause() : loader.dispose());
  window.addEventListener('pageshow', event => { if (event.persisted) loader.resume(); });
  document.addEventListener('visibilitychange', () => document.hidden ? loader.pause() : loader.resume());
  window.addEventListener('tg-a11y-change', describe);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', describe);
  stage.dataset.campaignState = state; describe();
}
