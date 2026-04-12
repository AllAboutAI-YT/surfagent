import CDP from 'chrome-remote-interface';

async function typeWithCDP(tabIndex, text) {
  try {
    const targets = await CDP.List({ port: 9222 });
    const pages = targets.filter(t => t.type === 'page');
    
    if (tabIndex >= pages.length) {
      console.error('Tab index out of range');
      process.exit(1);
    }
    
    const target = pages[tabIndex];
    const client = await CDP({ target: target.webSocketDebuggerUrl });
    
    const { Runtime, Input } = client;
    
    // Focus on the tweet text area
    await Runtime.evaluate({
      expression: `
        const el = document.querySelector('[data-testid="tweetTextarea_0"]');
        if (el) {
          el.focus();
          el.click();
        }
      `
    });
    
    await new Promise(r => setTimeout(r, 300));
    
    // Use Input.insertText for Draft.js compatibility
    await Input.insertText({ text: text });
    
    console.log(JSON.stringify({ success: true, typed: text }));
    
    await client.close();
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }
}

typeWithCDP(parseInt(process.argv[2]), process.argv[3]);
