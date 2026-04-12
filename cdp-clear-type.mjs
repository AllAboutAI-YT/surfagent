import CDP from 'chrome-remote-interface';

const tabIndex = parseInt(process.argv[2]) || 0;
const text = process.argv[3] || '';

try {
  const client = await CDP({ port: 9222 });
  const { Target } = client;
  const targets = await Target.getTargets();
  const pages = targets.targetInfos.filter(t => t.type === 'page');
  const target = pages[tabIndex];
  
  await client.close();
  
  const tab = await CDP({ port: 9222, target: target.targetId });
  const { Input } = tab;
  
  // Select all (Cmd+A) and delete
  await Input.dispatchKeyEvent({ type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 });
  await Input.dispatchKeyEvent({ type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
  await new Promise(r => setTimeout(r, 100));
  await Input.dispatchKeyEvent({ type: 'keyDown', key: 'Backspace', code: 'Backspace' });
  await Input.dispatchKeyEvent({ type: 'keyUp', key: 'Backspace', code: 'Backspace' });
  await new Promise(r => setTimeout(r, 100));
  
  // Type new text
  if (text) {
    await Input.insertText({ text });
  }
  
  await tab.close();
  console.log(JSON.stringify({ success: true, typed: text }));
} catch (e) {
  console.error(JSON.stringify({ success: false, error: e.message }));
}
