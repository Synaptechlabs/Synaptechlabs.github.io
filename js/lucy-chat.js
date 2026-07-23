(() => {
  const endpoint = 'https://lucy-agent.lucy-agent.workers.dev/chat';
  const turnstileSiteKey = '0x4AAAAAAD70UAZ2zMrs-XUK';
  let turnstileToken = null;
  let turnstileWidgetId = null;
  let requestInFlight = false;
  let previousResponseId = null;
  let turnCount = 0;

  const chat = document.createElement('aside');
  chat.className = 'lucy-chat';
  chat.innerHTML = `
    <section class="lucy-chat__panel" id="lucy-chat-panel" aria-label="Chat with Lucy" hidden>
      <header class="lucy-chat__header">
        <span><span class="lucy-chat__status" aria-hidden="true">●</span> Lucy - Scott's Personal Assistant</span>
        <button class="lucy-chat__close" type="button" aria-label="Close chat">×</button>
      </header>
      <div class="lucy-chat__transmission" data-state="idle" aria-hidden="true">
        <div class="lucy-chat__portrait lucy-chat__portrait--primary"></div>
        <div class="lucy-chat__portrait lucy-chat__portrait--transition" data-frame="idle-anticipating"></div>
        <span class="lucy-chat__signal">LUCY // REMOTE LINK</span>
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
  const transitionPortrait = chat.querySelector('.lucy-chat__portrait--transition');
  let responseStateTimer;
  let transitionStateTimer;
  let currentTransmissionState = 'idle';

  const transitionFrames = {
    'idle:anticipating': 'idle-anticipating',
    'anticipating:idle': 'idle-anticipating',
    'anticipating:thinking': 'anticipating-thinking',
    'thinking:anticipating': 'anticipating-thinking',
    'thinking:responding': 'thinking-responding',
    'responding:idle': 'responding-idle'
  };

  const setTransmissionState = (state) => {
    window.clearTimeout(responseStateTimer);
    if (state === currentTransmissionState) return;

    window.clearTimeout(transitionStateTimer);
    transitionPortrait.dataset.frame =
      transitionFrames[`${currentTransmissionState}:${state}`] || 'responding-idle';
    transitionPortrait.classList.add('lucy-chat__portrait--visible');
    currentTransmissionState = state;

    transitionStateTimer = window.setTimeout(() => {
      transmission.dataset.state = state;
      transitionPortrait.classList.remove('lucy-chat__portrait--visible');
    }, 140);
  };

  const scheduleTransmissionGlitch = () => {
    const delay = 1200 + Math.random() * 3600;
    window.setTimeout(() => {
      transmission.classList.add('lucy-chat__transmission--glitching');
      window.setTimeout(() => {
        transmission.classList.remove('lucy-chat__transmission--glitching');
        scheduleTransmissionGlitch();
      }, 90 + Math.random() * 190);
    }, delay);
  };

  scheduleTransmissionGlitch();

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

  const readSseStream = async (response, onEvent) => {
    if (!response.body) throw new Error('Streaming response body was unavailable');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processEvent = (chunk) => {
      const data = chunk
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');

      if (!data) return null;

      const streamEvent = JSON.parse(data);
      onEvent(streamEvent);
      return streamEvent.type === 'done' || streamEvent.type === 'error'
        ? streamEvent
        : null;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        const finalEvent = buffer.trim() ? processEvent(buffer) : null;
        return finalEvent;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const boundary = buffer.match(/\r?\n\r?\n/);
        if (!boundary || boundary.index === undefined) break;

        const chunk = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const terminalEvent = processEvent(chunk);

        if (terminalEvent) {
          await reader.cancel();
          return terminalEvent;
        }
      }
    }
  };

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false);
  });
  input.addEventListener('input', () => {
    if (!requestInFlight) setTransmissionState(input.value.trim() ? 'anticipating' : 'idle');
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
      const requestBody = {
        message,
        turnstileToken: tokenForRequest,
        turnCount
      };

      if (previousResponseId) {
        requestBody.previousResponseId = previousResponseId;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));

        if (response.status === 403 && errorBody.error === 'Turnstile verification failed') {
          userMessage.remove();
          input.value = message;
          loading.remove();
          addMessage('Verification expired or failed. Please try sending your message again.', 'error');
          setTransmissionState('anticipating');
          return;
        }

        throw new Error(errorBody.error || `Request failed with status ${response.status}`);
      }

      let replyMessage = null;
      const terminalEvent = await readSseStream(response, (streamEvent) => {
        if (streamEvent.type !== 'delta' || typeof streamEvent.text !== 'string') return;

        if (!replyMessage) {
          loading.remove();
          replyMessage = addMessage('');
          setTransmissionState('responding');
        }

        replyMessage.textContent += streamEvent.text;
        messages.scrollTop = messages.scrollHeight;
      });

      if (!terminalEvent) throw new Error('The response stream ended unexpectedly');

      if (terminalEvent.type === 'error') {
        const streamError = new Error('Lucy failed while generating a response');
        streamError.userMessage =
          typeof terminalEvent.message === 'string'
            ? terminalEvent.message
            : 'Lucy couldn’t finish that response. Please try again.';
        throw streamError;
      }

      if (!replyMessage) throw new Error('The response stream did not include any reply text');
      if (typeof terminalEvent.responseId !== 'string') {
        throw new Error('The response stream did not include a response ID');
      }

      previousResponseId = terminalEvent.responseId;
      turnCount += 1;
      responseStateTimer = window.setTimeout(() => {
        setTransmissionState(input.value.trim() ? 'anticipating' : 'idle');
      }, 2200);
    } catch (error) {
      console.error('Lucy chat request failed:', error);
      if (loading.isConnected) loading.remove();
      addMessage(
        error.userMessage || 'Sorry, Lucy couldn’t respond just now. Please try again in a moment.',
        'error'
      );
      setTransmissionState('idle');
    } finally {
      requestInFlight = false;
      input.disabled = false;
      resetTurnstile();
      input.focus();
    }
  });
})();
