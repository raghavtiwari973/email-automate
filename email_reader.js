const { google } = require('googleapis');
const { getCredentials } = require('./oauth_handler');

function decodeBase64(str) {
  if (!str) return '';
  const clean = str.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(clean, 'base64').toString('utf-8');
}

function extractPayloadBody(payload) {
  let plainText = '';
  let htmlContent = '';

  function walk(part) {
    if (!part) return;
    const mimeType = (part.mimeType || '').toLowerCase();
    const data = part.body && part.body.data;
    if (data) {
      const decoded = decodeBase64(data);
      if (mimeType === 'text/plain' && !plainText) {
        plainText = decoded;
      } else if (mimeType === 'text/html' && !htmlContent) {
        htmlContent = decoded;
      }
    }
    if (part.parts && Array.isArray(part.parts)) {
      for (const p of part.parts) {
        walk(p);
      }
    }
  }

  walk(payload);

  if (!plainText && htmlContent) {
    plainText = htmlContent
      .replace(/<(?:script|style|head)[^>]*>[\s\S]*?<\/(?:script|style|head)>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return { plainText: plainText.trim(), htmlContent: htmlContent.trim() };
}

async function fetchRecentInboxEmails(limit = 10) {
  const auth = getCredentials();
  if (!auth) {
    return [];
  }

  try {
    const gmail = google.gmail({ version: 'v1', auth });
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults: limit,
      q: 'category:primary OR label:INBOX',
    });

    const messages = listRes.data.messages || [];
    const results = [];

    for (const item of messages) {
      try {
        const msgRes = await gmail.users.messages.get({
          userId: 'me',
          id: item.id,
          format: 'full',
        });

        const headers = msgRes.data.payload?.headers || [];
        let from = '';
        let subject = '';
        let date = '';
        let messageId = '';

        for (const h of headers) {
          const name = h.name.toLowerCase();
          if (name === 'from') from = h.value;
          else if (name === 'subject') subject = h.value;
          else if (name === 'date') date = h.value;
          else if (name === 'message-id') messageId = h.value;
        }

        const { plainText, htmlContent } = extractPayloadBody(msgRes.data.payload);

        results.push({
          id: item.id,
          threadId: item.threadId,
          message_id: messageId,
          from,
          subject: subject || '(No Subject)',
          date,
          snippet: msgRes.data.snippet || '',
          body: plainText || msgRes.data.snippet || '',
          html: htmlContent,
        });
      } catch (err) {
        console.warn(`Error fetching email detail for ${item.id}:`, err.message);
      }
    }

    return results;
  } catch (err) {
    console.error('fetchRecentInboxEmails error:', err.message);
    return [];
  }
}

module.exports = {
  fetchRecentInboxEmails,
};
