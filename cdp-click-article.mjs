import CDP from 'chrome-remote-interface';

async function clickPost(tabIndex, searchText) {
  try {
    const targets = await CDP.List({ port: 9222 });
    const pages = targets.filter(t => t.type === 'page');
    const target = pages[tabIndex];
    const client = await CDP({ target: target.webSocketDebuggerUrl });
    const { Runtime } = client;
    
    const result = await Runtime.evaluate({
      expression: `
        (function() {
          const articles = document.querySelectorAll('article');
          for (const article of articles) {
            if (article.textContent.includes("${searchText}")) {
              article.click();
              return { success: true, found: true };
            }
          }
          return { success: false, error: 'Not found' };
        })()
      `,
      returnByValue: true
    });
    
    console.log(JSON.stringify(result.result.value));
    await client.close();
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }
}

clickPost(parseInt(process.argv[2]), process.argv[3]);
