const http = require("http");
const WebSocket = require("ws");

const target = process.argv[2] || "Accept";

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

  const res = await send("Runtime.evaluate", {
    expression: `(function(){
      var all = document.querySelectorAll('button, a, [role="button"]');
      for (var i = 0; i < all.length; i++) {
        var t = all[i].innerText.trim();
        if (t === '${target}') {
          var rect = all[i].getBoundingClientRect();
          return Math.round(rect.x+rect.width/2) + ',' + Math.round(rect.y+rect.height/2) + ',' + t;
        }
      }
      return 'NOT_FOUND';
    })()`,
    returnByValue: true
  });

  const val = res.result.result.value;
  console.log("Found:", val);

  if (!val || val === "NOT_FOUND") { ws.close(); return; }

  const parts = val.split(",");
  const x = parseInt(parts[0]);
  const y = parseInt(parts[1]);

  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await new Promise(r => setTimeout(r, 150));
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await new Promise(r => setTimeout(r, 80));
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });

  console.log("Clicked at", x, y);
  setTimeout(() => { ws.close(); process.exit(0); }, 2000);
}

run().catch(e => { console.error(e); process.exit(1); });
