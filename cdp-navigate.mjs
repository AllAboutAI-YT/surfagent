import CDP from 'chrome-remote-interface';

async function navigate(tabIndex, url) {
  try {
    const targets = await CDP.List({ port: 9222 });
    const pages = targets.filter(t => t.type === 'page');
    
    const target = pages[tabIndex];
    const client = await CDP({ target: target.webSocketDebuggerUrl });
    
    const { Page } = client;
    
    await Page.enable();
    await Page.navigate({ url: url });
    await Page.loadEventFired();
    
    console.log(JSON.stringify({ success: true, url: url }));
    
    await client.close();
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }
}

navigate(parseInt(process.argv[2]), process.argv[3]);
