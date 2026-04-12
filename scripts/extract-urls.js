#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function extractUrls(tabIndex = 0) {
  let client;
  try {
    const targets = await CDP.List();
    const pages = targets.filter(t => t.type === 'page');

    if (tabIndex >= pages.length) {
      console.error(`Tab ${tabIndex} not found. Only ${pages.length} tabs open.`);
      process.exit(1);
    }

    const target = pages[tabIndex];
    client = await CDP({ target });
    const { Runtime } = client;

    const result = await Runtime.evaluate({
      expression: `
        (function() {
          const urls = new Set();
          const currentHost = window.location.hostname;

          // Get all links
          document.querySelectorAll('a[href]').forEach(a => {
            const href = a.href;
            if (href && href.startsWith('http')) {
              urls.add(href);
            }
          });

          // Categorize URLs
          const external = [];
          const internal = [];
          const social = [];

          const socialDomains = ['twitter.com', 'x.com', 'github.com', 'linkedin.com', 'youtube.com', 'reddit.com', 'discord.com', 'medium.com', 'substack.com'];

          urls.forEach(url => {
            try {
              const urlObj = new URL(url);
              const host = urlObj.hostname;

              if (host === currentHost || host === 'www.' + currentHost) {
                internal.push(url);
              } else if (socialDomains.some(d => host.includes(d))) {
                social.push(url);
              } else {
                external.push(url);
              }
            } catch(e) {}
          });

          return JSON.stringify({
            currentUrl: window.location.href,
            internal: internal.slice(0, 20),
            social: social.slice(0, 20),
            external: external.slice(0, 20)
          }, null, 2);
        })()
      `,
      returnByValue: true
    });

    console.log(result.result.value);

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    if (client) await client.close();
  }
}

const tabIndex = parseInt(process.argv[2]) || 0;
extractUrls(tabIndex);
