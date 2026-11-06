'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, validateChat } = require('../server');

test('chat request validation bounds question and allows only supported languages', () => {
  assert.equal(validateChat({ question: '  Hello  ', language: 'en', context: [] }).question, 'Hello');
  assert.match(validateChat({ question: '', language: 'en' }).error, /characters/);
  assert.match(validateChat({ question: 'Hi', language: 'xx' }).error, /language/i);
  assert.match(validateChat({ question: 'Hi', language: 'en', context: [{ role: 'system', content: 'no' }] }).error, /context/i);
});

test('server serves the app and health endpoint without exposing server files', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');

  const page = await fetch(base);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Rwanda School Cloud/);
  assert.match(html, /receiptSms/);
  assert.match(html, /receiptEmail/);
  assert.match(html, /receiptWhatsApp/);
  assert.match(html, /wa\.me/);
  assert.match(html, /Messages are not sent automatically/);
  assert.match(html, /amountInput\.type='number'/);
  assert.match(html, /amountInput\.step='1'/);
  assert.match(html, /id="reportMarksRows"/);
  assert.match(html, /latestBySubject/);
  assert.match(html, /row\.cells\[6\]\.textContent\.trim\(\)!==term/);
  assert.match(html, /termCell\.textContent=document\.querySelector\('\.period'\)\.value/);
  assert.match(html, /Not REB-verified/);
  assert.match(html, /@page\{size:A4/);
  assert.doesNotMatch(html, /id="verifyReport"|RSS-DEMO-2026-A01|REPUBLIC OF RWANDA/);
  assert.match(html, /enrolledLearnerList/);
  assert.match(html, /localStorage\.setItem\(storageKey,JSON\.stringify\(state\)\)/);
  assert.match(html, /option\.dataset\.class=person\.className/);
  assert.match(html, /rss-learner-enrolled/);
  assert.match(html, /data-source="NESA"/);
  assert.match(html, /data-source="REB"/);
  assert.match(html, /data-source="MINEDUC"/);
  assert.match(html, /circular-preview-dialog/);
  assert.match(html, /FICTIONAL SAMPLE · NOT AN OFFICIAL GOVERNMENT DOCUMENT/);
  assert.match(html, /function createPdf\(circular\)/);
  assert.match(html, /type:'application\/pdf'/);
  assert.match(html, /Preview before downloading PDF/);
  assert.doesNotMatch(html, /id="paymentPin"|Check confirmation code/);
  assert.equal((await fetch(`${base}/server.js`)).status, 404);
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
});

test('QR endpoint creates local QR codes only for allowlisted demo learner IDs', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const qr = await fetch(`${base}/api/qr?id=DEMO-1001`);
  assert.equal(qr.status, 200);
  assert.match(qr.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(await qr.text(), /<svg/);
  assert.equal((await fetch(`${base}/api/qr?id=Alice%20Mukamana`)).status, 400);
});

test('unconfigured chat responds honestly without contacting a provider', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'Hello', language: 'en', context: [] })
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured/i);
});
