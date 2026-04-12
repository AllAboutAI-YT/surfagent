import CDP from 'chrome-remote-interface';

async function scroll(tabIndex, amount) {
  try {
    const targets = await CDP.List({ port: 9222 });
    const pages = targets.filter(t => t.type === 'page');
    
    const target = pages[tabIndex];
    const client = await CDP({ target: target.webSocketDebuggerUrl });
    
    const { Runtime } = client;
    
    await Runtime.evaluate({
      expression: `window.scrollBy(0, ${amount})`
    });
    
    console.log(JSON.stringify({ success: true, scrolled: amount }));
    
    await client.close();
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }
}

scroll(parseInt(process.argv[2]), parseInt(process.argv[3]) || 2000);
