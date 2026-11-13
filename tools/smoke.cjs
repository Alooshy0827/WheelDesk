// Runs the real application against an isolated data directory and a local model fixture.
const { app, BrowserWindow, nativeTheme } = require('electron');
nativeTheme.themeSource = 'light';
const { join } = require('node:path');
const { mkdirSync, writeFileSync, readdirSync } = require('node:fs');
const { createServer } = require('node:http');
const assert = require('node:assert/strict');
const root = join(__dirname, '..');
const smokeDir = process.env.WHEELDESK_DATA_DIR;
if (!smokeDir) throw new Error('Set WHEELDESK_DATA_DIR to an isolated test folder');
mkdirSync(smokeDir, { recursive: true });
app.setAppPath(root);
const errors = [];
app.on('web-contents-created', (_e, web) => {
  web.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  web.on('render-process-gone', (_e, details) => errors.push('renderer: ' + details.reason));
});
require('../out/main/index.js');
const pause = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await pause(40); }
  throw new Error('Timed out: ' + label);
}
let server;
app.whenReady().then(async () => {
  const win = await until(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('#settings')), 'settings window');
  await until(() => win.webContents.executeJavaScript('Boolean(window.desk && document.querySelector(".pageTitle"))'), 'React settings');
  const invoke = command => win.webContents.executeJavaScript(`window.desk.invoke(${JSON.stringify(command)})`);
  const first = await invoke({ type: 'state' });
  assert.equal(first.ok, true); assert.equal(first.state.settings.workbench.wheels.length, 2);
  const settings = first.state.settings;
  settings.language = 'zh-CN';
  settings.muted = true; // Decode and verify audio without making unattended test sounds.
  assert.equal((await invoke({ type: 'save', settings })).ok, true);
  await until(() => win.webContents.executeJavaScript('document.body.innerText.includes("我的轮盘")'), 'Chinese language');
  const pageText = await win.webContents.executeJavaScript('document.body.innerText');
  assert(!pageText.includes('lolPing')); assert(!pageText.includes('房间'));
  const screenshot = await win.webContents.capturePage();
  writeFileSync(join(smokeDir, 'settings.png'), screenshot.toPNG());
  // Verify the upstream scroll-navigation, grouped settings and actual wheel editor.
  assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".navItem").length'), 6);
  for (let i = 0; i < 6; i++) {
    await win.webContents.executeJavaScript(`document.querySelectorAll('.navItem')[${i}].click()`);
    await until(() => win.webContents.executeJavaScript(`document.querySelectorAll('.navItem')[${i}].classList.contains('sel')`), `section ${i}`);
    await pause(600);
    if (i === 1) writeFileSync(join(smokeDir, 'wheel-editor.png'), (await win.webContents.capturePage()).toPNG());
  }
  await win.webContents.executeJavaScript(`document.querySelector('[data-section="wheels"]').click()`);
  await pause(600);
  assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".weTile").length'), 12);
  assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".wdBinding").length'), 8);
  await win.webContents.executeJavaScript(`document.querySelectorAll('.weSlot')[0].click()`);
  await pause(50);
  await win.webContents.executeJavaScript(`document.querySelectorAll('.weSlot')[3].click()`);
  await until(async () => {
    const wheel = (await invoke({type:'state'})).state.settings.workbench.wheels[0];
    return wheel.effects[3] === 'danger' && wheel.effects[0] === 'allin' && wheel.slots[3] === 'copy' && wheel.slots[0] === 'undo';
  }, 'wheel editor moves effects together with functions and autosaves');
  await win.webContents.executeJavaScript(`document.querySelector('.wdBinding [role="combobox"]').click()`);
  await until(() => win.webContents.executeJavaScript('Boolean(document.querySelector("[role=option]"))'), 'function choices');
  await win.webContents.executeJavaScript(`document.querySelector('[role="option"]').click()`);
  await until(async () => (await invoke({type:'state'})).state.settings.workbench.wheels[0].slots[0] === null, 'wheel editor clears and autosaves slot');
  assert.equal((await invoke({ type: 'save', settings })).ok, true);
  nativeTheme.themeSource = 'dark'; await pause(500);
  writeFileSync(join(smokeDir, 'wheel-editor-dark.png'), (await win.webContents.capturePage()).toPNG());
  nativeTheme.themeSource = 'light';

  // Real renderer, production custom origin, unchanged upstream Wheel/PingFx/SoundBank code.
  const beforePreview = (await invoke({type:'state'})).state.run;
  assert.equal((await invoke({type:'previewEffect', effect:'invalid'})).ok, false);
  assert.equal((await invoke({type:'previewEffect', effect:'allin'})).ok, true);
  const overlay = await until(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('#overlay')), 'overlay window');
  const overlayJS = code => overlay.webContents.executeJavaScript(code);
  await until(() => overlayJS('document.querySelectorAll(".clash img").length === 2'), 'original All In collision');
  assert.equal(await overlayJS('document.querySelectorAll(".ring").length'), 3);
  assert.equal(await overlayJS('Boolean(document.querySelector(".flash"))'), true);
  await until(() => overlayJS('[...document.querySelectorAll(".ping img")].every(i => i.complete && i.naturalWidth > 0)'), 'original textures load');
  assert.equal(await overlayJS('getComputedStyle(document.querySelector(".clash")).animationName'), 'shake, bob');
  assert.deepEqual((await invoke({type:'state'})).state.run, beforePreview);
  const soundFiles = readdirSync(join(root, 'out/renderer/sounds')).filter(s => s.endsWith('.wav'));
  const decoded = await overlayJS(`(async () => {
    const ctx = new AudioContext();
    try { return await Promise.all(${JSON.stringify(soundFiles)}.map(async file => {
      const response = await fetch('../sounds/' + file);
      if (!response.ok) throw new Error('audio HTTP ' + response.status);
      return (await ctx.decodeAudioData(await response.arrayBuffer())).duration > 0;
    })); } finally { await ctx.close(); }
  })()`);
  assert.equal(decoded.length, 12); assert(decoded.every(Boolean));
  assert.equal((await overlayJS('window.desk.invoke({type:"previewEffect",effect:"danger"})')).ok, false);
  const visual = Object.fromEntries(['wheelSizePx','pingSizePx','pingDurationS','volume','muted','tickSound'].map(k => [k, settings[k]]));
  const wheel = settings.workbench.wheels[0];
  const labels = wheel.slots.map(id => settings.workbench.actions.find(a => a.id === id).name);
  const sendOverlay = event => overlay.webContents.send('desk:overlay', event);
  sendOverlay({type:'close',clear:true});
  sendOverlay({type:'open',x:360,y:330,effects:wheel.effects,enabled:Array(8).fill(true),labels,name:'常用工具',visual});
  await until(() => overlayJS('document.querySelector("#wheel").classList.contains("open")'), 'original wheel opens');
  await pause(160);
  assert.equal(await overlayJS('document.querySelectorAll("#wheel .icon").length'), 8);
  assert.equal(await overlayJS(`[...document.querySelectorAll('#wheel path')].filter(p => p.getAttribute('fill') === 'url(#lp-wheel-ext)').length`), 4);
  assert.equal(await overlayJS('getComputedStyle(document.querySelector("#wheel")).transitionDuration'), '0.12s, 0.12s');
  sendOverlay({type:'move',x:360,y:190});
  await until(() => overlayJS('document.querySelector("#wheel .centerTxt").textContent === "复制"'), 'custom function label on original wheel');
  await until(() => overlayJS('getComputedStyle(document.querySelector("#wheel .icon.hot")).transform === "matrix(1.18, 0, 0, 1.18, 0, 0)"'), 'original 1.18x hover scale', 3000);
  writeFileSync(join(smokeDir,'original-wheel.png'), (await overlay.webContents.capturePage({x:0,y:0,width:720,height:660})).toPNG());
  sendOverlay({type:'move',x:360,y:330});
  await until(() => overlayJS('document.querySelectorAll("#wheel .icon.hot").length === 0'), 'original center cancel zone');
  sendOverlay({type:'close',clear:true});
  for (const [i, effect] of ['danger','push','omw','allin','assist','needvision','missing','enemyvision','generic','bait','visioncleared','missingflip'].entries()) {
    sendOverlay({type:'effect',effect,x:120+(i%4)*190,y:130+Math.floor(i/4)*190,visual:{...visual,pingSizePx:100,pingDurationS:3.2}});
  }
  await until(() => overlayJS('document.querySelectorAll(".ping").length === 12'), 'all original effects');
  await pause(240);
  writeFileSync(join(smokeDir,'original-effects.png'), (await overlay.webContents.capturePage({x:0,y:0,width:820,height:660})).toPNG());
  sendOverlay({type:'close',clear:true});
  await until(() => !overlay.isVisible(), 'empty overlay hides after animation');

  const requests = [];
  server = createServer(async (req, res) => {
    if (req.url === '/v1/models') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'fixture-model' }] })); return; }
    let text = ''; for await (const chunk of req) text += chunk;
    const body = JSON.parse(text); requests.push(body);
    res.setHeader('Content-Type', 'text/event-stream');
    for (const delta of ['你好', '，WheelDesk。']) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`);
    res.end(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 5 } })}\n\ndata: [DONE]\n\n`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  settings.workbench.profiles = [{ id: 'fixture', name: 'Fixture', kind: 'builtin', provider: 'custom', protocol: 'openai', baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model', tagColor: 3, tagColorCustom: null }];
  settings.workbench.defaultProfileId = 'fixture';
  settings.workbench.actions.push({ id: 'smokeAI', name: '测试 AI', nameEn: 'Test AI', kind: 'ai', input: 'none', value: 'Translate hello', windows: '', mac: '', profileId: '', timeoutS: 10, output: 'card' });
  assert.equal((await invoke({ type: 'save', settings })).ok, true);
  const checked = await invoke({ type: 'check', id: 'fixture' }); assert.deepEqual(checked.models, ['fixture-model']);
  assert.equal((await invoke({ type: 'run', id: 'smokeAI' })).ok, true);
  const finished = await until(async () => { const s = (await invoke({ type: 'state' })).state; return s.run.status === 'completed' && s.run.name === '测试 AI' ? s : null; }, 'AI result', 20000);
  assert.equal(finished.run.text, '你好，WheelDesk。'); assert.equal(finished.run.inputTokens, 12);
  assert.equal(requests.length, 1); assert(!requests[0].tools); assert.equal(typeof requests[0].messages[1].content, 'string');
  const resultWin = await until(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('#result')), 'result window');
  await until(() => resultWin.webContents.executeJavaScript('document.body.innerText.includes("你好，WheelDesk。")'), 'rendered result');
  writeFileSync(join(smokeDir, 'result.png'), (await resultWin.webContents.capturePage()).toPNG());
  assert.equal((await resultWin.webContents.executeJavaScript('window.desk.invoke({type:"save",settings:{}})')).ok, false);
  assert.equal((await resultWin.webContents.executeJavaScript('window.desk.invoke({type:"key",id:"fixture",key:"not-stored"})')).ok, false);
  assert.equal((await resultWin.webContents.executeJavaScript('window.desk.invoke({type:"previewEffect",effect:"danger"})')).ok, false);
  settings.workbench.actions.push({ id: 'smokeScript', name: '脚本测试', nameEn: 'Script test', kind: 'script', input: 'none', value: '', windows: '[Console]::Write("script-ok")', mac: 'printf script-ok', profileId: '', timeoutS: 5, output: 'card' });
  assert.equal((await invoke({ type: 'save', settings })).ok, true);
  assert.equal((await invoke({ type: 'run', id: 'smokeScript' })).ok, true);
  await until(async () => { const s = (await invoke({ type: 'state' })).state; return s.run.status === 'completed' && s.run.text === 'script-ok'; }, 'real script action');
  assert.deepEqual(errors, []);
  writeFileSync(join(smokeDir, 'report.json'), JSON.stringify({ passed: true, helper: finished.helper,
    checks: ['settings mounts', 'upstream six-section navigation', 'original effect/function pairs move and autosave', 'empty function slots', '12 original effects', 'original collision/ring/bobbing animations', '12 sounds fetched and decoded', 'preview does not execute actions', 'original wheel geometry/hover/transition', 'custom function labels', 'idle overlay cleanup', 'light and dark themes', 'Chinese language', 'independent branding', 'model listing', 'text-only AI request', 'no AI tools', 'streamed result', 'usage', 'renderer IPC permissions', 'real script action'], rendererErrors: errors }, null, 2));
  console.log('WheelDesk smoke passed', JSON.stringify({ helper: finished.helper }));
  server.close(); app.quit();
}).catch(error => { console.error(error); if (server) server.close(); app.exit(1); });
