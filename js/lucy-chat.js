(() => {
  const endpoint = 'https://lucy-agent.lucy-agent.workers.dev/chat';
  const turnstileSiteKey = '0x4AAAAAAD70UAZ2zMrs-XUK';
  let turnstileToken = null;
  let turnstileWidgetId = null;
  let requestInFlight = false;

  const chat = document.createElement('aside');
  chat.className = 'lucy-chat';
  chat.innerHTML = `
    <section class="lucy-chat__panel" id="lucy-chat-panel" aria-label="Chat with Lucy" hidden>
      <header class="lucy-chat__header">
        <span><span class="lucy-chat__status" aria-hidden="true">●</span> Lucy - Scott's Personal Assistant</span>
        <button class="lucy-chat__close" type="button" aria-label="Close chat">×</button>
      </header>
      <div class="lucy-chat__transmission" data-state="idle" aria-hidden="true">
        <div class="lucy-chat__portrait"></div>
        <span class="lucy-chat__signal">LUCY // REMOTE LINK</span>
        <span class="lucy-chat__signal lucy-chat__signal--state">IDLE</span>
      </div>
      <div class="lucy-chat__messages" aria-live="polite" aria-relevant="additions">
        <p class="lucy-chat__message">Hi, I’m Lucy. How can I help?</p>
      </div>
      <form class="lucy-chat__form">
        <div id="turnstile-widget" data-action="turnstile-spin-v2"></div>
        <label for="lucy-chat-input" class="lucy-chat__label" hidden>Message Lucy</label>
        <input class="lucy-chat__input" id="lucy-chat-input" name="message" type="text" placeholder="Type a message…" autocomplete="off" required>
        <button class="lucy-chat__send" type="submit" disabled>Send</button>
      </form>
    </section>
    <button class="lucy-chat__toggle" type="button" aria-expanded="false" aria-controls="lucy-chat-panel">
      <span class="lucy-chat__toggle-dot" aria-hidden="true">●</span> Ask Lucy
    </button>`;

  document.body.append(chat);

  const panel = chat.querySelector('.lucy-chat__panel');
  const toggle = chat.querySelector('.lucy-chat__toggle');
  const close = chat.querySelector('.lucy-chat__close');
  const form = chat.querySelector('.lucy-chat__form');
  const input = chat.querySelector('.lucy-chat__input');
  const send = chat.querySelector('.lucy-chat__send');
  const messages = chat.querySelector('.lucy-chat__messages');
  const turnstileWidget = chat.querySelector('#turnstile-widget');
  const transmission = chat.querySelector('.lucy-chat__transmission');
  const transmissionState = chat.querySelector('.lucy-chat__signal--state');
  let responseStateTimer;

  const setTransmissionState = (state) => {
    window.clearTimeout(responseStateTimer);
    transmission.dataset.state = state;
    transmissionState.textContent = state.toUpperCase();
    transmission.classList.remove('lucy-chat__transmission--switching');
    void transmission.offsetWidth;
    transmission.classList.add('lucy-chat__transmission--switching');
  };

  const updateSendState = () => {
    send.disabled = requestInFlight || !turnstileToken;
  };

  const resetTurnstile = () => {
    turnstileToken = null;
    updateSendState();
    if (turnstileWidgetId !== null && window.turnstile) {
      window.turnstile.reset(turnstileWidgetId);
    }
  };

  const renderTurnstile = () => {
    if (!window.turnstile || turnstileWidgetId !== null) return;

    turnstileWidgetId = window.turnstile.render(turnstileWidget, {
      sitekey: turnstileSiteKey,
      size: 'invisible',
      action: 'turnstile-spin-v2',
      callback: (token) => {
        turnstileToken = token;
        updateSendState();
      },
      'expired-callback': resetTurnstile,
      'timeout-callback': resetTurnstile,
      'error-callback': () => {
        resetTurnstile();
        return true;
      }
    });
  };

  if (window.turnstile) {
    renderTurnstile();
  } else {
    const turnstileScript = document.querySelector('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
    turnstileScript?.addEventListener('load', renderTurnstile, { once: true });
  }

  const setOpen = (open) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
    else toggle.focus();
  };

  const addMessage = (text, kind = 'reply') => {
    const message = document.createElement('p');
    message.className = `lucy-chat__message lucy-chat__message--${kind}`;
    message.textContent = text;
    messages.append(message);
    messages.scrollTop = messages.scrollHeight;
    return message;
  };

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false);
  });
  input.addEventListener('input', () => {
    if (!requestInFlight) setTransmissionState(input.value.trim() ? 'listening' : 'idle');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || requestInFlight || !turnstileToken) return;

    const userMessage = addMessage(message, 'user');
    const tokenForRequest = turnstileToken;
    turnstileToken = null;
    requestInFlight = true;
    input.value = '';
    input.disabled = true;
    updateSendState();
    setTransmissionState('thinking');
    const loading = addMessage('Lucy is thinking…', 'loading');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, turnstileToken: tokenForRequest })
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 403 && data.error === 'Turnstile verification failed') {
        userMessage.remove();
        input.value = message;
        loading.remove();
        addMessage('Verification expired or failed. Please try sending your message again.', 'error');
        setTransmissionState('listening');
        return;
      }

      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      if (typeof data.reply !== 'string') throw new Error('Response did not include a reply');

      loading.remove();
      addMessage(data.reply);
      setTransmissionState('responding');
      responseStateTimer = window.setTimeout(() => setTransmissionState('idle'), 2200);
    } catch (error) {
      console.error('Lucy chat request failed:', error);
      loading.remove();
      addMessage('Sorry, Lucy couldn’t respond just now. Please try again in a moment.', 'error');
      setTransmissionState('idle');
    } finally {
      requestInFlight = false;
      input.disabled = false;
      resetTurnstile();
      input.focus();
    }
  });
})();
