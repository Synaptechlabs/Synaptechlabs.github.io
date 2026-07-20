(() => {
  const endpoint = 'https://lucy-agent.lucy-agent.workers.dev/chat';

  const chat = document.createElement('aside');
  chat.className = 'lucy-chat';
  chat.innerHTML = `
    <section class="lucy-chat__panel" id="lucy-chat-panel" aria-label="Chat with Lucy" hidden>
      <header class="lucy-chat__header">
        <span><span class="lucy-chat__status" aria-hidden="true">●</span> Lucy - Scott's Personal Assistant</span>
        <button class="lucy-chat__close" type="button" aria-label="Close chat">×</button>
      </header>
      <div class="lucy-chat__messages" aria-live="polite" aria-relevant="additions">
        <p class="lucy-chat__message">Hi, I’m Lucy. How can I help?</p>
      </div>
      <form class="lucy-chat__form">
        <label for="lucy-chat-input" class="lucy-chat__label" hidden>Message Lucy</label>
        <input class="lucy-chat__input" id="lucy-chat-input" name="message" type="text" placeholder="Type a message…" autocomplete="off" required>
        <button class="lucy-chat__send" type="submit">Send</button>
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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || send.disabled) return;

    addMessage(message, 'user');
    input.value = '';
    input.disabled = true;
    send.disabled = true;
    const loading = addMessage('Lucy is thinking…', 'loading');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });

      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

      const data = await response.json();
      if (typeof data.reply !== 'string') throw new Error('Response did not include a reply');

      loading.remove();
      addMessage(data.reply);
    } catch (error) {
      console.error('Lucy chat request failed:', error);
      loading.remove();
      addMessage('Sorry, Lucy couldn’t respond just now. Please try again in a moment.', 'error');
    } finally {
      input.disabled = false;
      send.disabled = false;
      input.focus();
    }
  });
})();
