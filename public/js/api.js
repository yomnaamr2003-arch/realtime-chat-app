const Api = (() => {
  async function request(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  return {
    register: (payload) => request('POST', '/api/auth/register', payload),
    login: (payload) => request('POST', '/api/auth/login', payload),
    logout: () => request('POST', '/api/auth/logout'),
    me: () => request('GET', '/api/auth/me'),

    searchUsers: (q) => request('GET', `/api/users/search?q=${encodeURIComponent(q)}`),

    listConversations: () => request('GET', '/api/conversations'),
    createDirectConversation: (userId) => request('POST', '/api/conversations/direct', { userId }),
    getMessages: (conversationId, before) =>
      request('GET', `/api/conversations/${conversationId}/messages${before ? `?before=${before}` : ''}`),
    markConversationRead: (conversationId, messageId) =>
      request('POST', `/api/conversations/${conversationId}/read`, { messageId }),

    listNotifications: () => request('GET', '/api/notifications'),
    markNotificationRead: (id) => request('POST', `/api/notifications/${id}/read`),
    markAllNotificationsRead: () => request('POST', '/api/notifications/read-all'),
  };
})();
