const http = require("http");
const WebSocket = require("ws");

async function run() {
  const tabs = await new Promise((resolve) => {
    http.get("http://localhost:9222/json", (r) => {
      let data = "";
      r.on("data", c => data += c);
      r.on("end", () => resolve(JSON.parse(data)));
    });
  });

  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  let id = 1;
  function send(method, params) {
    return new Promise((resolve) => {
      const msgId = id++;
      ws.send(JSON.stringify({ id: msgId, method, params }));
      const handler = (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.id === msgId) {
          ws.off("message", handler);
          resolve(msg);
        }
      };
      ws.on("message", handler);
    });
  }

  await new Promise(r => ws.on("open", r));

  // List all button texts containing Buy or Down
  const res = await send("Runtime.evaluate", {
    expression: `(function(){
      var btns = document.querySelectorAll('button');
      var out = [];
      for (var i = 0; i < btns.length; i++) {
        var t = btns[i].innerText.replace(/\\n/g,'|').trim();
        if (t.indexOf('Buy') !== -1 || t.indexOf('Down') !== -1) {
          out.push('[' + i + '] ' + t.substring(0,60));
        }
      }
      return out.join('\\n');
    })()`,
    returnByValue: true
  });

  console.log("Buttons with Buy/Down:\n" + res.result.result.value);

  ws.close();
}

run().catch(e => { console.error(e); process.exit(1); });
