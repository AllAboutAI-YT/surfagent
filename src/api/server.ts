#!/usr/bin/env node

import http from 'node:http';
import { reconUrl, reconTab } from './recon.js';
import { fillFields, clickElement, scrollPage, navigatePage, evalInTab, focusTab, readPage, captchaInteract, dismissOverlays, typeKeys, dispatchEvent } from './act.js';
import { getAllTabs } from '../chrome/tabs.js';

const PORT = parseInt(process.env.API_PORT || '3456', 10);
const CDP_PORT = parseInt(process.env.CDP_PORT || '9222', 10);
const CDP_HOST = process.env.CDP_HOST || 'localhost';

interface RequestBody {
  url?: string;
  tab?: string;
  waitMs?: number;
  keepTab?: boolean;
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString();
}

function json(res: http.ServerResponse, status: number, data: any) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function parseBody(raw: string): any {
  if (!raw || !raw.trim()) throw new SyntaxError('Empty request body');
  return JSON.parse(raw);
}

function cors(res: http.ServerResponse) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const path = url.pathname;

  if (req.method === 'OPTIONS') return cors(res);

  try {
    // POST /recon — full page reconnaissance
    if (path === '/recon' && req.method === 'POST') {
      const body: RequestBody = parseBody(await readBody(req));

      if (!body.url && !body.tab) {
        return json(res, 400, { error: 'Provide "url" (to open new page) or "tab" (to recon existing tab)' });
      }

      const start = Date.now();
      let result;

      if (body.url) {
        result = await reconUrl(body.url, {
          port: CDP_PORT,
          host: CDP_HOST,
          waitMs: body.waitMs,
          keepTab: body.keepTab,
        });
      } else {
        result = await reconTab(body.tab!, { port: CDP_PORT, host: CDP_HOST });
      }

      return json(res, 200, {
        ...result,
        _reconMs: Date.now() - start,
      });
    }

    // POST /fill — fill form fields via CDP keystrokes
    if (path === '/fill' && req.method === 'POST') {
      const body = parseBody(await readBody(req));
      if (!body.tab || !body.fields) {
        return json(res, 400, { error: 'Provide "tab" and "fields" [{ selector, value }]' });
      }
      if (!Array.isArray(body.fields)) {
        return json(res, 400, { error: '"fields" must be an array of { selector, value }' });
      }
      const start = Date.now();
      const result = await fillFields(body, { port: CDP_PORT, host: CDP_HOST });
      return json(res, 200, { ...result, _fillMs: Date.now() - start });
    }

    // POST /click — click an element
    if (path === '/click' && req.method === 'POST') {
      const body = parseBody(await readBody(req));
      if (!body.tab || (!body.selector && !body.text)) {
        return json(res, 400, { error: 'Provide "tab" and "selector" or "text"' });
      }
      const result = await clickElement(body, { port: CDP_PORT, host: CDP_HOST });
      return json(res, 200, result);
    }

    // POST /scroll — scroll a page
    if (path === '/scroll' && req.method === 'POST') {
      const body = parseBody(await readBody(req));
      if (!body.tab) {
        return json(res, 400, { error: 'Provide "tab", optional "direction" (down/up), "amount" (pixels)' });
      }
      const result = await scrollPage(body, { port: CDP_PORT, host: CDP_HOST });
      return json(res, 200, result);
    }

    // POST /dismiss — dismiss cookie banners, modals, overlays
    if (path === '/dismiss' && req.method === 'POST') {
      const body = parseBody(await readBody(req));
      if (!body.tab) {
        return json(res, 400, { error: 'Provide "tab"' });
      }
      const result = await dismissOverlays(body.tab, { port: CDP_PORT, host: CDP_HOST });
      return json(res, 200, result);
    }

    // POST /captcha — detect and interact with captchas
    if (path === '/captcha' && req.method === 'POST') {
      const body = parseBody(await readBody(req));
      if (!body.action) {
        return json(res, 400, { error: 'Provide "action": detect, read, next, prev, submit, audio, restart' });
      }
      if (body.action === 'detect' && !body.tab) {
        return json(res, 400, { error: 'Provide "tab" for detect action' });
      }
      const result = await captchaInteract(body, { port: CDP_PORT, host: CDP_HOST });
      return json(res, 200, result);
    }

    // POST /read — get structured readable content from a page
    if (path === '/read' && req.method === 'POST') {
      const body = parseBody(await readBody(req));
      if (!body.tab) {
        return json(res, 400, { error: 'Provide "tab", optional "selector"' });
      }
      const result = await readPage(body.tab, { port: CDP_PORT, host: CDP_HOST, selector: body.selector });
      return json(res, 200, result);
    }

    // POST /focus — bring a tab to front
    if (path === '/focus' && req.method === 'POST') {
      const body = parseBody(await readBody(req));
      if (!body.tab) {
        return json(res, 400, { error: 'Provide "tab"' });
      }
      const result = await focusTab(body.tab, { port: CDP_PORT, host: CDP_HOST });
      return json(res, 200, result);
    }

    // POST /eval — run JavaScript in a tab or iframe
    if (path === '/eval' && req.method === 'POST') {
      const body = parseBody(await readBody(req));
      if (!body.tab || !body.expression) {
        return json(res, 400, { error: 'Provide "tab" and "expression"' });
      }
      const result = await evalInTab(body.tab, body.expression, { port: CDP_PORT, host: CDP_HOST });
      if (result && result.__error) {
        return json(res, 200, { result: null, error: result.__error });
      }
      return json(res, 200, { result });
    }

    // POST /type — raw CDP key typing, no clear step (for Google Sheets, contenteditable, etc.)
    if (path === '/type' && req.method === 'POST') {
      const body = parseBody(await readBody(req));
      if (!body.tab || !body.keys) {
        return json(res, 400, { error: 'Provide "tab" and "keys" (string to type), optional "submit": "enter"|"tab"' });
      }
      const result = await typeKeys(body.tab, body.keys, { port: CDP_PORT, host: CDP_HOST, submit: body.submit });
      return json(res, 200, result);
    }

    // POST /dispatch — dispatch DOM events on elements (React SPA workaround)
    if (path === '/dispatch' && req.method === 'POST') {
      const body = parseBody(await readBody(req));
      if (!body.tab || !body.selector || (!body.event && !body.reactDebug)) {
        return json(res, 400, { error: 'Provide "tab", "selector", and "event" (e.g. "submit", "click"). Add "reactDebug":true to inspect React handlers instead.' });
      }
      const start = Date.now();
      const result = await dispatchEvent(body, { port: CDP_PORT, host: CDP_HOST });
      return json(res, 200, { ...result, _dispatchMs: Date.now() - start });
    }

    // POST /navigate — go to url, back, or forward in same tab
    if (path === '/navigate' && req.method === 'POST') {
      const body = parseBody(await readBody(req));
      if (!body.tab) {
        return json(res, 400, { error: 'Provide "tab" and one of: "url", "back":true, "forward":true' });
      }
      if (!body.url && !body.back && !body.forward) {
        return json(res, 400, { error: 'Provide one of: "url", "back":true, "forward":true' });
      }
      if ((body.url && body.back) || (body.url && body.forward) || (body.back && body.forward)) {
        return json(res, 400, { error: 'Provide only one of: "url", "back", "forward"' });
      }
      const result = await navigatePage(body, { port: CDP_PORT, host: CDP_HOST });
      return json(res, 200, result);
    }

    // GET /tabs — list open tabs
    if (path === '/tabs' && req.method === 'GET') {
      const tabs = await getAllTabs(CDP_PORT, CDP_HOST);
      return json(res, 200, { tabs });
    }

    // GET /health
    if (path === '/health') {
      try {
        const tabs = await getAllTabs(CDP_PORT, CDP_HOST);
        return json(res, 200, { status: 'ok', cdpConnected: true, tabCount: tabs.length });
      } catch {
        return json(res, 503, { status: 'error', cdpConnected: false });
      }
    }

    json(res, 404, { error: 'Not found. Endpoints: POST /recon, /read, /fill, /click, /type, /scroll, /navigate, /eval, /dispatch, /dismiss, /captcha, /focus | GET /tabs, /health' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${new Date().toISOString()}] Error:`, message);

    if (error instanceof SyntaxError) {
      return json(res, 400, { error: 'Invalid JSON: ' + message });
    }
    if (message.includes('Tab not found')) {
      return json(res, 404, { error: message });
    }
    if (message.includes('Cannot connect to Chrome') || message.includes('ECONNREFUSED')) {
      return json(res, 503, { error: 'Chrome not running. Start with: surfagent start' });
    }
    json(res, 500, { error: message });
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[surfagent] Port ${PORT} is already in use. API may already be running.`);
    console.error(`[surfagent] Check with: curl localhost:${PORT}/health`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`Browser Recon API running on http://localhost:${PORT}`);
  console.log(`CDP target: ${CDP_HOST}:${CDP_PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /recon   — { url: "..." } or { tab: "0" }`);
  console.log(`  POST /fill    — { tab, fields: [{ selector, value }], submit? }`);
  console.log(`  POST /click   — { tab, selector? , text? }`);
  console.log(`  POST /dispatch— { tab, selector, event, reactDebug? }`);
  console.log(`  GET  /tabs    — list open Chrome tabs`);
  console.log(`  GET  /health  — check CDP connection`);
});
