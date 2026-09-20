(() => {
  'use strict';

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  const state = {
    me: null,
    token: null,
    socket: null,
    conversations: new Map(), // id -> conversation
    activeConversationId: null,
    typingTimeout: null,
    typingUsers: new Map(), // conversationId -> Set(username)
  };

  // ---------------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const authView = $('#auth-view');
  const appView = $('#app-view');
  const loginForm = $('#login-form');
  const registerForm = $('#register-form');
  const toast = $('#toast');

  // ---------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------
  function showToast(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle('is-error', isError);
    toast.classList.remove('is-hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.add('is-hidden'), 3500);
  }

  function initials(name) {
    return (name || '?').slice(0, 2).toUpperCase();
  }

  function formatTime(iso) {
    const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatRelative(iso) {
    if (!iso) return '';
    const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return d.toLocaleDateString();
  }

  // ---------------------------------------------------------------------
  // Auth view wiring
  // ---------------------------------------------------------------------
  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      const isLogin = tab.dataset.tab === 'login';
      loginForm.classList.toggle('is-hidden', !isLogin);
      registerForm.classList.toggle('is-hidden', isLogin);
    });
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = loginForm.querySelector('[data-error-for="login"]');
    errEl.textContent = '';
    const formData = new FormData(loginForm);
    try {
      const { user } = await Api.login({
        email: formData.get('email'),
        password: formData.get('password'),
      });
      await bootApp(user);
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = registerForm.querySelector('[data-error-for="register"]');
    errEl.textContent = '';
    const formData = new FormData(registerForm);
    try {
      const { user } = await Api.register({
        username: formData.get('username'),
        email: formData.get('email'),
        password: formData.get('password'),
      });
      await bootApp(user);
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  $('#logout-btn').addEventListener('click', async () => {
    try {
      await Api.logout();
    } finally {
      if (state.socket) state.socket.disconnect();
      window.location.reload();
    }
  });

  // ---------------------------------------------------------------------
  // App bootstrap
  // ---------------------------------------------------------------------
  async function bootApp(user) {
    state.me = user;
    authView.classList.add('is-hidden');
    appView.classList.remove('is-hidden');

    $('#me-username').textContent = user.username;
    const avatarEl = $('#me-avatar');
    avatarEl.textContent = initials(user.username);
    avatarEl.style.background = user.avatar_color;

    connectSocket();
    await loadConversations();
    await loadNotifications();
  }

  async function tryResumeSession() {
    try {
      const { user } = await Api.me();
      await bootApp(user);
    } catch {
      // Not logged in yet; stay on the auth view.
    }
  }

  // ---------------------------------------------------------------------
  // Socket.IO
  // ---------------------------------------------------------------------
  function connectSocket() {
    const socket = io({ withCredentials: true });
    state.socket = socket;

    socket.on('connect_error', (err) => showToast(err.message || 'Connection error', true));

    socket.on('message:new', (message) => {
      if (message.conversation_id === state.activeConversationId) {
        appendMessage(message);
        scrollMessagesToBottom();
        Api.markConversationRead(state.activeConversationId, message.id).catch(() => {});
      }
      updateConversationPreview(message.conversation_id, message.body, message.created_at);
    });

    socket.on('notification:new', ({ conversationId, message }) => {
      prependNotification({
        id: `live-${Date.now()}`,
        type: 'new_message',
        is_read: 0,
        created_at: new Date().toISOString(),
        payload: {
          conversationId,
          senderUsername: message.sender_username,
          preview: message.body,
        },
      });
      if (conversationId !== state.activeConversationId) {
        showToast(`New message from ${message.sender_username}`);
      }
    });

    socket.on('presence:update', ({ userId, isOnline, lastSeen }) => {
      updatePresenceUI(userId, isOnline, lastSeen);
    });

    socket.on('typing:start', ({ conversationId, username }) => {
      if (conversationId !== state.activeConversationId) return;
      if (!state.typingUsers.has(conversationId)) state.typingUsers.set(conversationId, new Set());
      state.typingUsers.get(conversationId).add(username);
      renderTypingIndicator();
    });

    socket.on('typing:stop', ({ conversationId, username }) => {
      state.typingUsers.get(conversationId)?.delete(username);
      renderTypingIndicator();
    });
  }

  function renderTypingIndicator() {
    const el = $('#typing-indicator');
    const users = state.typingUsers.get(state.activeConversationId);
    if (!users || users.size === 0) {
      el.classList.add('is-hidden');
      el.textContent = '';
      return;
    }
    el.classList.remove('is-hidden');
    el.textContent = `${[...users].join(', ')} ${users.size === 1 ? 'is' : 'are'} typing…`;
  }

  // ---------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------
  async function loadConversations() {
    const { conversations } = await Api.listConversations();
    state.conversations.clear();
    conversations.forEach((c) => state.conversations.set(c.id, c));
    renderConversationList();
  }

  function renderConversationList() {
    const list = $('#conversation-list');
    list.innerHTML = '';
    const sorted = [...state.conversations.values()].sort((a, b) => {
      const at = a.last_message_at || a.created_at;
      const bt = b.last_message_at || b.created_at;
      return new Date(bt) - new Date(at);
    });

    for (const conv of sorted) {
      const other = conv.participants && conv.participants[0];
      const title = conv.is_group ? conv.name : other ? other.username : 'Direct message';

      const li = document.createElement('li');
      li.className = 'conversation-row' + (conv.id === state.activeConversationId ? ' is-active' : '');
      li.dataset.id = conv.id;
      li.innerHTML = `
        <span class="avatar" style="background:${other ? other.avatar_color : '#6366f1'}">${initials(title)}</span>
        <div class="conversation-meta">
          <div class="conversation-name">
            ${escapeHtml(title)}
            ${other ? `<i class="dot ${other.is_online ? 'dot-online' : 'dot-offline'}"></i>` : ''}
          </div>
          <div class="conversation-preview">${escapeHtml(conv.last_message || 'Say hello 👋')}</div>
        </div>
      `;
      li.addEventListener('click', () => openConversation(conv.id));
      list.appendChild(li);
    }
  }

  function updateConversationPreview(conversationId, body, createdAt) {
    const conv = state.conversations.get(conversationId);
    if (!conv) {
      loadConversations();
      return;
    }
    conv.last_message = body;
    conv.last_message_at = createdAt;
    renderConversationList();
  }

  function updatePresenceUI(userId, isOnline, lastSeen) {
    for (const conv of state.conversations.values()) {
      const p = (conv.participants || []).find((u) => u.id === userId);
      if (p) {
        p.is_online = isOnline;
        p.last_seen = lastSeen;
      }
    }
    renderConversationList();
    if (state.activeConversationId) {
      const conv = state.conversations.get(state.activeConversationId);
      const other = conv?.participants?.[0];
      if (other && other.id === userId) renderThreadHeader(conv);
    }
  }

  async function openConversation(conversationId) {
    state.activeConversationId = conversationId;
    state.socket.emit('conversation:join', conversationId);
    renderConversationList();

    $('#empty-state').classList.add('is-hidden');
    $('#thread').classList.remove('is-hidden');

    const conv = state.conversations.get(conversationId);
    renderThreadHeader(conv);

    const { messages } = await Api.getMessages(conversationId);
    const list = $('#message-list');
    list.innerHTML = '';
    messages.forEach(appendMessage);
    scrollMessagesToBottom();

    if (messages.length) {
      await Api.markConversationRead(conversationId, messages[messages.length - 1].id).catch(() => {});
    }
    renderTypingIndicator();
  }

  function renderThreadHeader(conv) {
    if (!conv) return;
    const other = conv.participants && conv.participants[0];
    const title = conv.is_group ? conv.name : other ? other.username : 'Direct message';
    $('#thread-title').textContent = title;
    $('#thread-subtitle').textContent = other
      ? other.is_online
        ? 'Online'
        : `Last seen ${formatRelative(other.last_seen)}`
      : `${(conv.participants || []).length + 1} members`;
  }

  function appendMessage(message) {
    const list = $('#message-list');
    const isOwn = message.sender_id === state.me.id;
    const row = document.createElement('div');
    row.className = 'message-row ' + (isOwn ? 'is-own' : 'is-other');
    row.innerHTML = `
      <span class="message-meta">${isOwn ? 'You' : escapeHtml(message.sender_username)} · ${formatTime(message.created_at)}</span>
      <div class="message-bubble"></div>
    `;
    // body is already HTML-escaped server-side; render as text content for defense in depth.
    row.querySelector('.message-bubble').textContent = unescapeHtml(message.body);
    list.appendChild(row);
  }

  function scrollMessagesToBottom() {
    const list = $('#message-list');
    list.scrollTop = list.scrollHeight;
  }

  // ---------------------------------------------------------------------
  // Sending messages + typing
  // ---------------------------------------------------------------------
  const messageForm = $('#message-form');
  const messageInput = $('#message-input');

  messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const body = messageInput.value.trim();
    if (!body || !state.activeConversationId) return;

    const sendBtn = messageForm.querySelector('.btn-send');
    sendBtn.disabled = true;

    state.socket.emit('message:send', { conversationId: state.activeConversationId, body }, (ack) => {
      sendBtn.disabled = false;
      if (!ack.ok) {
        showToast(ack.error || 'Could not send message.', true);
        return;
      }
      messageInput.value = '';
      autoGrow(messageInput);
      state.socket.emit('typing:stop', state.activeConversationId);
    });
  });

  messageInput.addEventListener('input', () => {
    autoGrow(messageInput);
    if (!state.activeConversationId) return;
    state.socket.emit('typing:start', state.activeConversationId);
    clearTimeout(state.typingTimeout);
    state.typingTimeout = setTimeout(() => {
      state.socket.emit('typing:stop', state.activeConversationId);
    }, 1500);
  });

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      messageForm.requestSubmit();
    }
  });

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }

  // ---------------------------------------------------------------------
  // User search -> start conversation
  // ---------------------------------------------------------------------
  const searchInput = $('#user-search');
  const searchResults = $('#search-results');
  let searchDebounce = null;

  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const q = searchInput.value.trim();
    if (!q) {
      searchResults.classList.add('is-hidden');
      return;
    }
    searchDebounce = setTimeout(async () => {
      const { users } = await Api.searchUsers(q);
      renderSearchResults(users);
    }, 250);
  });

  document.addEventListener('click', (e) => {
    if (!searchResults.contains(e.target) && e.target !== searchInput) {
      searchResults.classList.add('is-hidden');
    }
  });

  function renderSearchResults(users) {
    if (!users.length) {
      searchResults.innerHTML = `<div class="search-result-row">No matches</div>`;
      searchResults.classList.remove('is-hidden');
      return;
    }
    searchResults.innerHTML = '';
    users.forEach((u) => {
      const row = document.createElement('div');
      row.className = 'search-result-row';
      row.innerHTML = `
        <span class="avatar" style="width:26px;height:26px;font-size:11px;background:${u.avatar_color}">${initials(u.username)}</span>
        <span>${escapeHtml(u.username)}</span>
      `;
      row.addEventListener('click', async () => {
        const { conversation } = await Api.createDirectConversation(u.id);
        await loadConversations();
        searchInput.value = '';
        searchResults.classList.add('is-hidden');
        openConversation(conversation.id);
      });
      searchResults.appendChild(row);
    });
    searchResults.classList.remove('is-hidden');
  }

  // ---------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------
  async function loadNotifications() {
    const { notifications } = await Api.listNotifications();
    const list = $('#notification-list');
    list.innerHTML = '';
    notifications.forEach((n) => renderNotification(n));
  }

  function prependNotification(n) {
    const list = $('#notification-list');
    const li = notificationRowEl(n);
    list.prepend(li);
  }

  function renderNotification(n) {
    const list = $('#notification-list');
    list.appendChild(notificationRowEl(n));
  }

  function notificationRowEl(n) {
    const li = document.createElement('li');
    li.className = 'notification-row' + (n.is_read ? '' : ' is-unread');
    li.dataset.id = n.id;
    li.innerHTML = `
      <div class="n-title">${escapeHtml(n.payload.senderUsername)} sent a message</div>
      <div class="n-preview">${escapeHtml(unescapeHtml(n.payload.preview || ''))}</div>
      <div class="n-time">${formatRelative(n.created_at)}</div>
    `;
    li.addEventListener('click', async () => {
      if (typeof n.id === 'number') await Api.markNotificationRead(n.id).catch(() => {});
      li.classList.remove('is-unread');
      if (n.payload.conversationId) openConversation(n.payload.conversationId);
    });
    return li;
  }

  $('#mark-all-read').addEventListener('click', async () => {
    await Api.markAllNotificationsRead().catch(() => {});
    document.querySelectorAll('.notification-row').forEach((el) => el.classList.remove('is-unread'));
  });

  // ---------------------------------------------------------------------
  // HTML escaping helpers (server also escapes; this is defense in depth
  // for anything rendered via innerHTML, e.g. usernames)
  // ---------------------------------------------------------------------
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function unescapeHtml(str) {
    const div = document.createElement('textarea');
    div.innerHTML = str ?? '';
    return div.value;
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------
  tryResumeSession();
})();
