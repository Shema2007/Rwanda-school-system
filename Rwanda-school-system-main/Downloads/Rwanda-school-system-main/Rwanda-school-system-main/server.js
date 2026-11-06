'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 1234);
const HOST = process.env.BIND_HOST || '127.0.0.1';
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_BASE_URL = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || '';
const BODY_LIMIT = 12 * 1024;
const CONTEXT_LIMIT = 10;
const QUESTION_LIMIT = 1200;
const REMOTE_BIND = !['127.0.0.1', 'localhost', '::1'].includes(HOST);
const QR_IDS = new Set(['DEMO-1001', 'DEMO-1002', 'DEMO-1003', 'DEMO-1004', 'DEMO-1005']);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT must be a valid TCP port.');
}
if (REMOTE_BIND && API_ACCESS_TOKEN.length < 32) {
  throw new Error('Remote binding requires an API_ACCESS_TOKEN of at least 32 characters.');
}

const languageNames = {
  rw: 'Kinyarwanda',
  en: 'English',
  fr: 'French',
  sw: 'Kiswahili'
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}

function authorized(req) {
  if (!REMOTE_BIND) return true;
  const header = req.headers.authorization || '';
  return header === `Bearer ${API_ACCESS_TOKEN}`;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > BODY_LIMIT) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (body.length > BODY_LIMIT) return;
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error('Send a valid JSON request.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function validateChat(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request must be a JSON object.' };
  }
  if (typeof body.question !== 'string' || !body.question.trim() || body.question.length > QUESTION_LIMIT) {
    return { error: `Question must contain 1–${QUESTION_LIMIT} characters.` };
  }
  if (!Object.hasOwn(languageNames, body.language)) {
    return { error: 'Choose a supported language: Kinyarwanda, English, French, or Kiswahili.' };
  }
  if (body.context !== undefined && !Array.isArray(body.context)) {
    return { error: 'Chat context must be a list of messages.' };
  }
  const context = (body.context || []).slice(-CONTEXT_LIMIT);
  if (context.some(item => !item || !['user', 'assistant'].includes(item.role)
    || typeof item.content !== 'string' || item.content.length > QUESTION_LIMIT)) {
    return { error: 'Chat context contains an invalid or oversized message.' };
  }
  return {
    question: body.question.trim(),
    language: body.language,
    context: context.map(item => ({ role: item.role, content: item.content }))
  };
}

async function handleChat(req, res) {
  if (!sameOrigin(req)) return sendJson(res, 403, { error: 'Cross-origin requests are not allowed.' });
  if (!authorized(req)) return sendJson(res, 401, { error: 'This server requires an authorized access token.' });
  if (!AI_API_KEY) return sendJson(res, 503, { error: 'Online assistant is not configured. Use the offline helper or configure AI_API_KEY on the server.' });
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
    return sendJson(res, 415, { error: 'Content-Type must be application/json.' });
  }

  let parsed;
  try {
    parsed = await readJson(req);
  } catch (error) {
    return sendJson(res, error.status || 400, { error: error.status === 413 ? error.message : 'Could not read the request body.' });
  }
  const input = validateChat(parsed);
  if (input.error) return sendJson(res, 400, { error: input.error });

  const system = `You are Ikirezi, a helpful school-learning assistant. Answer in ${languageNames[input.language]}. Be clear, kind, and concise. State uncertainty instead of inventing facts. You receive only the learner's typed question and a short chat context; you have no access to profiles, student records, or live school systems. If asked about current REB or NESA rules, dates, or policy, advise the user to confirm through current official sources; this API may not include live web search.`;
  const messages = [
    { role: 'system', content: system },
    ...input.context,
    { role: 'user', content: input.question }
  ];

  let upstream;
  try {
    upstream = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: AI_MODEL, messages, max_tokens: 700, temperature: 0.4 }),
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    const timeout = error.name === 'TimeoutError' || error.name === 'AbortError';
    return sendJson(res, 502, { error: timeout ? 'The AI provider took too long to respond. Please try again.' : 'The AI provider could not be reached. Check server connectivity and provider settings.' });
  }

  if (!upstream.ok) {
    return sendJson(res, 502, { error: `The AI provider returned HTTP ${upstream.status}. Check the server-side provider configuration.` });
  }
  let result;
  try {
    result = await upstream.json();
  } catch {
    return sendJson(res, 502, { error: 'The AI provider returned an unreadable response.' });
  }
  const answer = result?.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) {
    return sendJson(res, 502, { error: 'The AI provider returned no answer.' });
  }
  return sendJson(res, 200, { answer: answer.slice(0, 8000), mode: 'online' });
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
}

function createServer() {
  return http.createServer(async (req, res) => {
    securityHeaders(res);
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { status: 'ok', port: PORT });
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: 'Cross-origin requests are not allowed.' });
      return sendJson(res, 200, {
        configured: Boolean(AI_API_KEY),
        model: AI_MODEL,
        accessTokenRequired: REMOTE_BIND
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      return handleChat(req, res);
    }
    if (req.method === 'GET' && url.pathname === '/api/qr') {
      const id = url.searchParams.get('id');
      if (!QR_IDS.has(id)) return sendJson(res, 400, { error: 'Only a fictional demo learner ID can be encoded.' });
      try {
        const svg = await QRCode.toString(id, {
          type: 'svg',
          margin: 1,
          width: 220,
          color: { dark: '#0b1725', light: '#ffffff' }
        });
        res.writeHead(200, {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff'
        });
        return res.end(svg);
      } catch {
        return sendJson(res, 500, { error: 'Could not create the local demo QR code.' });
      }
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      try {
        const html = await fs.promises.readFile(path.join(ROOT, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      } catch {
        return sendJson(res, 500, { error: 'The app page could not be loaded.' });
      }
    }
    return sendJson(res, 404, { error: 'Not found.' });
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`Rwanda School Cloud listening at http://${HOST}:${PORT}`);
    console.log(`Ikirezi online AI: ${AI_API_KEY ? `configured (${AI_MODEL})` : 'not configured; offline demo remains available'}`);
  });
}

module.exports = { createServer, validateChat };
