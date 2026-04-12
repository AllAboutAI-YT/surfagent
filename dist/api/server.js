#!/usr/bin/env node
import http from 'node:http';
import { reconUrl, reconTab } from './recon.js';
import { fillFields, clickElement, scrollPage, navigatePage, evalInTab, focusTab, readPage, captchaInteract } from './act.js';
import { getAllTabs } from '../chrome/tabs.js';
const PORT = parseInt(process.env.API_PORT || '3456', 10);
const CDP_PORT = parseInt(process.env.CDP_PORT || '9222', 10);
const CDP_HOST = process.env.CDP_HOST || 'localhost';
async function readBody(req) {
    const chunks = [];
    for await (const chunk of req)
        chunks.push(chunk);
    return Buffer.concat(chunks).toString();
}
function json(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
}
function cors(res) {
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
    if (req.method === 'OPTIONS')
        return cors(res);
    try {
        // POST /recon — full page reconnaissance
        if (path === '/recon' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req));
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
            }
            else {
                result = await reconTab(body.tab, { port: CDP_PORT, host: CDP_HOST });
            }
            return json(res, 200, {
                ...result,
                _reconMs: Date.now() - start,
            });
        }
        // POST /fill — fill form fields via CDP keystrokes
        if (path === '/fill' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req));
            if (!body.tab || !body.fields) {
                return json(res, 400, { error: 'Provide "tab" and "fields" [{ selector, value }]' });
            }
            const start = Date.now();
            const result = await fillFields(body, { port: CDP_PORT, host: CDP_HOST });
            return json(res, 200, { ...result, _fillMs: Date.now() - start });
        }
        // POST /click — click an element
        if (path === '/click' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req));
            if (!body.tab || (!body.selector && !body.text)) {
                return json(res, 400, { error: 'Provide "tab" and "selector" or "text"' });
            }
            const result = await clickElement(body, { port: CDP_PORT, host: CDP_HOST });
            return json(res, 200, result);
        }
        // POST /scroll — scroll a page
        if (path === '/scroll' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req));
            if (!body.tab) {
                return json(res, 400, { error: 'Provide "tab", optional "direction" (down/up), "amount" (pixels)' });
            }
            const result = await scrollPage(body, { port: CDP_PORT, host: CDP_HOST });
            return json(res, 200, result);
        }
        // POST /captcha — detect and interact with captchas
        if (path === '/captcha' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req));
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
            const body = JSON.parse(await readBody(req));
            if (!body.tab) {
                return json(res, 400, { error: 'Provide "tab", optional "selector"' });
            }
            const result = await readPage(body.tab, { port: CDP_PORT, host: CDP_HOST, selector: body.selector });
            return json(res, 200, result);
        }
        // POST /focus — bring a tab to front
        if (path === '/focus' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req));
            if (!body.tab) {
                return json(res, 400, { error: 'Provide "tab"' });
            }
            const result = await focusTab(body.tab, { port: CDP_PORT, host: CDP_HOST });
            return json(res, 200, result);
        }
        // POST /eval — run JavaScript in a tab or iframe
        if (path === '/eval' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req));
            if (!body.tab || !body.expression) {
                return json(res, 400, { error: 'Provide "tab" and "expression"' });
            }
            const result = await evalInTab(body.tab, body.expression, { port: CDP_PORT, host: CDP_HOST });
            return json(res, 200, { result });
        }
        // POST /navigate — go to url, back, or forward in same tab
        if (path === '/navigate' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req));
            if (!body.tab) {
                return json(res, 400, { error: 'Provide "tab" and one of: "url", "back":true, "forward":true' });
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
            }
            catch {
                return json(res, 503, { status: 'error', cdpConnected: false });
            }
        }
        json(res, 404, { error: 'Not found. Endpoints: POST /recon, GET /tabs, GET /health' });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[${new Date().toISOString()}] Error:`, message);
        json(res, 500, { error: message });
    }
});
server.listen(PORT, () => {
    console.log(`Browser Recon API running on http://localhost:${PORT}`);
    console.log(`CDP target: ${CDP_HOST}:${CDP_PORT}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /recon   — { url: "..." } or { tab: "0" }`);
    console.log(`  POST /fill    — { tab, fields: [{ selector, value }], submit? }`);
    console.log(`  POST /click   — { tab, selector? , text? }`);
    console.log(`  GET  /tabs    — list open Chrome tabs`);
    console.log(`  GET  /health  — check CDP connection`);
});
