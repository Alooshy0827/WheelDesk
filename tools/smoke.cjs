// Runs the real application against an isolated data directory and a local model fixture.
const { app, BrowserWindow, nativeTheme, screen } = require('electron');
nativeTheme.themeSource = 'light';
const { join } = require('node:path');
const { mkdirSync, writeFileSync, readdirSync } = require('node:fs');
const { createServer } = require('node:http');
const assert = require('node:assert/strict');
// Use a disposable keychain for fake test credentials, never the user's login keychain.
app.commandLine.appendSwitch('use-mock-keychain');
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
// Optional native simulator feeds the production bridge without generating OS input.
let simulatedHook;
if (process.env.WHEELDESK_SMOKE_GESTURES === '1') {
  const processes = require('node:child_process');
  const spawn = processes.spawn;
  processes.spawn = (command, args, options) => {
    if (command === join(root, 'native/hook-helper/build', process.platform === 'win32' ? 'hook-helper.exe' : 'hook-helper')) {
      simulatedHook = spawn(command, ['--simulate'], options); return simulatedHook;
    }
    return spawn(command, args, options);
  };
}
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
  const evaluate = win.webContents.executeJavaScript.bind(win.webContents);
  win.webContents.executeJavaScript = async (...args) => {
    try { return await evaluate(...args); }
    catch (e) { console.error('Failed UI evaluation:', args[0]); throw e; }
  };
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
  const countWheels = new Map();
  async function chooseCount(count) {
    await win.webContents.executeJavaScript(`document.querySelector('[role="combobox"][aria-label="辐数"]').click()`);
    await until(() => win.webContents.executeJavaScript(`Boolean([...document.querySelectorAll('[role="option"]')].find(o => o.textContent === '${count} 辐'))`), 'spoke count options');
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('[role="option"]')].find(o => o.textContent === '${count} 辐').click()`);
    await until(async () => (await invoke({type:'state'})).state.settings.workbench.wheels[0].slotCount === count, `persist ${count} spokes`);
    await until(() => win.webContents.executeJavaScript(`document.querySelectorAll('.weSlot').length === ${count} && document.querySelectorAll('.wdBinding').length === ${count}`), `render ${count} spokes`);
    countWheels.set(count, (await invoke({type:'state'})).state.settings.workbench.wheels[0]);
  }
  await chooseCount(12);
  await win.webContents.executeJavaScript(`document.querySelectorAll('.wdBinding [role="combobox"]')[11].click()`);
  await until(() => win.webContents.executeJavaScript('Boolean(document.querySelector("[role=option]"))'), 'new spoke binding options');
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('[role="option"]')].find(o => o.textContent === '复制').click()`);
  await until(async () => (await invoke({type:'state'})).state.settings.workbench.wheels[0].slots[11] === 'copy', 'save twelfth binding');
  await chooseCount(3);
  await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload(); });
  await until(() => win.webContents.executeJavaScript('document.querySelectorAll(".weSlot").length === 3'), 'reload saved count');
  await win.webContents.executeJavaScript(`document.querySelector('[data-section="wheels"]').click()`);
  await pause(600);
  for (const count of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    await chooseCount(count);
    if (count === 6 || count === 12) writeFileSync(join(smokeDir, `wheel-editor-${count}.png`), (await win.webContents.capturePage()).toPNG());
  }
  const counted = (await invoke({type:'state'})).state.settings.workbench;
  assert.equal(counted.wheels[0].slots[11], 'copy');
  assert.deepEqual(counted.wheels[0].slots.slice(0, 8), settings.workbench.wheels[0].slots);
  assert.equal(counted.wheels[1].slotCount, 8);
  assert.equal((await invoke({ type: 'save', settings })).ok, true);
  await until(() => win.webContents.executeJavaScript('document.querySelectorAll(".weSlot").length === 8'), 'restore eight-spoke fixture');
  nativeTheme.themeSource = 'dark'; await pause(500);
  writeFileSync(join(smokeDir, 'wheel-editor-dark.png'), (await win.webContents.capturePage()).toPNG());
  nativeTheme.themeSource = 'light';

  // Real renderer, production custom origin and upstream effects with dynamic wheel geometry.
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
  for (const [count, savedWheel] of countWheels) {
    const activeSlots = savedWheel.slots.slice(0, count);
    sendOverlay({type:'open',x:360,y:330,effects:savedWheel.effects.slice(0,count),enabled:activeSlots.map(() => true),
      labels:activeSlots.map(id => settings.workbench.actions.find(a => a.id === id)?.name ?? ''),name:`${count} 辐轮盘`,visual});
    await until(() => overlayJS(`document.querySelectorAll('#wheel .icon').length === ${count} && document.querySelectorAll('#wheel .wedge').length === ${count}`), `${count}-spoke overlay`);
    const rad = (count - 1) * 2 * Math.PI / count;
    sendOverlay({type:'move',x:360+200*Math.sin(rad),y:330-200*Math.cos(rad)});
    await until(() => overlayJS(`document.querySelectorAll('#wheel .icon')[${count-1}].classList.contains('hot')`), `${count}-spoke hit alignment`);
    if (count === 6 || count === 12) {
      await pause(160);
      writeFileSync(join(smokeDir, `wheel-${count}.png`), (await overlay.webContents.capturePage({x:0,y:0,width:720,height:660})).toPNG());
    }
    sendOverlay({type:'close',clear:true});
  }
  for (const [i, effect] of ['danger','push','omw','allin','assist','needvision','missing','enemyvision','generic','bait','visioncleared','missingflip'].entries()) {
    sendOverlay({type:'effect',effect,x:120+(i%4)*190,y:130+Math.floor(i/4)*190,visual:{...visual,pingSizePx:100,pingDurationS:3.2}});
  }
  await until(() => overlayJS('document.querySelectorAll(".ping").length === 12'), 'all original effects');
  await pause(240);
  writeFileSync(join(smokeDir,'original-effects.png'), (await overlay.webContents.capturePage({x:0,y:0,width:820,height:660})).toPNG());
  sendOverlay({type:'close',clear:true});
  await until(() => !overlay.isVisible(), 'empty overlay hides after animation');

  if (process.env.WHEELDESK_SMOKE_GESTURES === '1') {
    await until(() => simulatedHook, 'native gesture simulator');
    const emptySettings = structuredClone(settings);
    emptySettings.workbench.wheels[0].slots[0] = null;
    emptySettings.workbench.wheels[0].effects[0] = 'allin';
    assert.equal((await invoke({type:'save', settings:emptySettings})).ok, true);
    const beforeEmpty = (await invoke({type:'state'})).state.run;
    const bounds = screen.getPrimaryDisplay().bounds;
    let simTime = 1000;
    const sim = (ev, x = 360, y = 330, extra = {}) => {
      const point = {x: bounds.x + x, y: bounds.y + y};
      const physical = process.platform === 'darwin' ? point : screen.dipToScreenPoint(point);
      simulatedHook.stdin.write(JSON.stringify({type:'sim',ev,...physical,t:simTime += 20,...extra}) + '\n');
    };
    sim('kdown',360,330,{vk:164}); sim('mdown',360,330,{btn:'left'}); sim('move',360,190);
    await until(() => overlayJS('document.querySelector("#wheel").classList.contains("open")'), 'unbound wheel via production bridge');
    sim('move',360,180);
    await until(() => overlayJS('document.querySelector("#wheel .centerTxt").textContent === "全力进攻"'), 'unbound slot uses effect name');
    assert.equal(await overlayJS('document.querySelectorAll("#wheel .icon.dim").length'), 0);
    sim('mup',360,180,{btn:'left'}); sim('kup',360,180,{vk:164});
    await until(() => overlayJS('document.querySelectorAll(".clash img").length === 2'), 'unbound slot plays original All In effect');
    sim('mup',360,180,{btn:'left'});
    await pause(80);
    assert.equal(await overlayJS('document.querySelectorAll(".ping").length'), 1);
    assert.deepEqual((await invoke({type:'state'})).state.run, beforeEmpty);
    assert(!BrowserWindow.getAllWindows().some(w => w.webContents.getURL().includes('#result')));
    sendOverlay({type:'close',clear:true});
    assert.equal((await invoke({type:'save',settings})).ok,true);
  }

  const requests = [];
  let probeStatus = 200;
  const authHeaders = [];
  server = createServer(async (req, res) => {
    if (req.url === '/v1/models') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'fixture-model' }] })); return; }
    authHeaders.push(req.headers.authorization);
    if (probeStatus !== 200) { res.writeHead(probeStatus, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:{message:'do-not-leak-draft-key'}})); return; }
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
  await win.webContents.executeJavaScript(`document.querySelector('[data-section="models"]').click()`);
  await pause(600);
  const expectedPresets = [
    ['OpenAI', 'openai', 'https://api.openai.com/v1', 'openai'],
    ['Anthropic / Claude', 'anthropic', 'https://api.anthropic.com', 'anthropic'],
    ['DeepSeek', 'deepseek', 'https://api.deepseek.com', 'openai'],
    ['阿里云百炼 / 通义千问（中国内地）', 'qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'openai'],
    ['Kimi / Moonshot（国内）', 'kimi', 'https://api.moonshot.cn/v1', 'openai'],
    ['Google Gemini', 'gemini', 'https://generativelanguage.googleapis.com/v1beta/openai', 'openai'],
    ['Ollama（本地）', 'ollama', 'http://localhost:11434/v1', 'openai'],
    ['LM Studio（本地）', 'lmstudio', 'http://localhost:1234/v1', 'openai'],
  ];
  for (const [label, provider, baseUrl, protocol] of expectedPresets) {
    await win.webContents.executeJavaScript(`document.querySelector('[role="combobox"][aria-label="厂商预设"]').click()`);
    await until(() => win.webContents.executeJavaScript(`document.getElementById(document.querySelector('[role="combobox"][aria-label="厂商预设"]').getAttribute('aria-controls'))?.querySelectorAll('[role="option"]').length === 9`), 'provider menu ' + label);
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('[role=option]')].find(o => o.textContent === ${JSON.stringify(label)}).click()`);
    await until(async () => (await invoke({type:'state'})).state.settings.workbench.profiles[0].provider === provider, `saved ${provider}`);
    const p = (await invoke({type:'state'})).state.settings.workbench.profiles[0];
    assert.equal(p.baseUrl, baseUrl); assert.equal(p.protocol, protocol); assert.equal(p.model, '');
    assert.equal(await win.webContents.executeJavaScript(`Boolean(document.querySelector('.wdModelEditor [aria-label="接口格式"]').closest('[inert]'))`), true);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.wdModelEditor [aria-label="接口格式"]').textContent.includes(${JSON.stringify(protocol === 'anthropic' ? 'Anthropic Messages 格式' : 'OpenAI 兼容格式（Chat Completions）')})`), true);
  }
  await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload(); });
  await until(() => win.webContents.executeJavaScript('document.querySelector("[aria-label=厂商预设]")?.textContent.includes("LM Studio")'), 'provider persists after reload');
  assert.equal(await win.webContents.executeJavaScript('document.querySelector(".wdModelEditor").textContent.includes("本地模型通常无需密钥")'), true);
  await win.webContents.executeJavaScript(`document.querySelector('.wdModelEditor .expChevron').click()`);
  await until(() => win.webContents.executeJavaScript('!document.querySelector(".wdModelEditor .expBody").inert'), 'advanced settings expand');
  assert.equal((await invoke({ type: 'save', settings })).ok, true);
  await until(() => win.webContents.executeJavaScript('document.querySelector("[aria-label=厂商预设]")?.textContent.includes("自定义")'), 'fixture configuration');
  await win.webContents.executeJavaScript(`document.querySelector('[data-section="models"]').click()`);
  await pause(600);
  const clickModelButton = label => win.webContents.executeJavaScript(`[...document.querySelectorAll('.wdModelEditor button')].find(b => b.textContent === ${JSON.stringify(label)}).click()`);
  const modelStatus = () => win.webContents.executeJavaScript('document.querySelector(".wdModelEditor [role=status]")?.textContent || ""');
  await win.webContents.executeJavaScript(`(() => { const el = document.querySelector('input[aria-label="API 密钥"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'draft-probe-key'); el.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await clickModelButton('保存并测试连接');
  await until(async () => (await modelStatus()).includes('连接成功'), 'real connection-test button');
  assert.equal(authHeaders.at(-1), 'Bearer draft-probe-key');
  assert.equal((await invoke({type:'state'})).state.keyIds.includes('fixture'), true);
  assert.equal(await win.webContents.executeJavaScript(`document.querySelector('input[aria-label="API 密钥"]').value`), '');
  assert.equal(requests.at(-1).messages[1].content, 'Reply with OK.');
  assert(!requests.at(-1).tools);
  await win.webContents.executeJavaScript(`document.querySelector('.wdModelEditor [role="status"]').scrollIntoView({block:'center',behavior:'instant'})`);
  writeFileSync(join(smokeDir, 'model-presets.png'), (await win.webContents.capturePage()).toPNG());
  probeStatus = 401;
  await win.webContents.executeJavaScript(`(() => { const el = document.querySelector('input[aria-label="API 密钥"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'bad-replacement-key'); el.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await clickModelButton('保存并测试连接');
  await until(async () => (await modelStatus()).includes('API 密钥验证失败'), 'localized connection failure');
  assert(!(await modelStatus()).includes('do-not-leak'));
  await win.webContents.executeJavaScript(`document.querySelector('.wdModelEditor [role="status"]').scrollIntoView({block:'center',behavior:'instant'})`);
  writeFileSync(join(smokeDir, 'model-test-error.png'), (await win.webContents.capturePage()).toPNG());
  probeStatus = 200;
  await win.webContents.executeJavaScript(`(() => { const el = document.querySelector('input[aria-label="API 密钥"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  requests.length = 0;
  assert.equal((await invoke({type:'testModel',id:'fixture',key:123})).ok, false);
  assert.equal((await overlayJS('window.desk.invoke({type:"testModel",id:"fixture"})')).ok, false);
  await clickModelButton('获取模型列表');
  await until(async () => (await modelStatus()).includes('已获取 1 个模型'), 'model-list button');
  assert.equal(authHeaders.at(-1), 'Bearer bad-replacement-key'); // Failed test used the draft key only.
  const checked = await invoke({ type: 'check', id: 'fixture' }); assert.deepEqual(checked.models, ['fixture-model']);
  assert.equal((await invoke({ type: 'run', id: 'smokeAI' })).ok, true);
  const finished = await until(async () => { const s = (await invoke({ type: 'state' })).state; return s.run.status === 'completed' && s.run.name === '测试 AI' ? s : null; }, 'AI result', 20000);
  assert.equal(authHeaders.at(-1), 'Bearer draft-probe-key');
  assert.equal(finished.run.text, '你好，WheelDesk。'); assert.equal(finished.run.inputTokens, 12);
  assert.equal(requests.length, 1); assert(!requests[0].tools); assert.equal(typeof requests[0].messages[1].content, 'string');
  const resultWin = await until(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('#result')), 'result window');
  await until(() => resultWin.webContents.executeJavaScript('document.body.innerText.includes("你好，WheelDesk。")'), 'rendered result');
  await until(() => resultWin.isVisible(), 'AI result card remains visible');
  writeFileSync(join(smokeDir, 'result.png'), (await resultWin.webContents.capturePage()).toPNG());
  assert.equal((await resultWin.webContents.executeJavaScript('window.desk.invoke({type:"save",settings:{}})')).ok, false);
  assert.equal((await resultWin.webContents.executeJavaScript('window.desk.invoke({type:"key",id:"fixture",key:"not-stored"})')).ok, false);
  assert.equal((await resultWin.webContents.executeJavaScript('window.desk.invoke({type:"previewEffect",effect:"danger"})')).ok, false);
  assert.equal((await resultWin.webContents.executeJavaScript('window.desk.invoke({type:"testModel",id:"fixture"})')).ok, false);
  settings.workbench.actions.push({ id: 'smokeScript', name: '脚本测试', nameEn: 'Script test', kind: 'script', input: 'none', value: '', windows: '[Console]::Write("script-ok")', mac: 'printf script-ok', profileId: '', timeoutS: 5, output: 'card' });
  assert.equal((await invoke({ type: 'save', settings })).ok, true);
  assert.equal((await invoke({ type: 'run', id: 'smokeScript' })).ok, true);
  await until(async () => { const s = (await invoke({ type: 'state' })).state; return s.run.status === 'completed' && s.run.text === 'script-ok'; }, 'real script action');
  // Observe real window show events, including short flashes during ordinary actions.
  await resultWin.webContents.executeJavaScript('window.desk.invoke({type:"close"})');
  let resultShows = 0;
  resultWin.on('show', () => resultShows++);
  const baseAction = { nameEn: '', input: 'none', value: '', windows: '', mac: '', profileId: '', timeoutS: 5, output: 'card' };
  settings.workbench.actions.push(
    { ...baseAction, id: 'quietSwitch', name: 'Quiet switch', kind: 'switchWheel', value: 'ai' },
    { ...baseAction, id: 'quietDelay', name: 'Quiet delay', kind: 'delay', value: '300' },
    { ...baseAction, id: 'visibleFailure', name: 'Visible failure', kind: 'openUrl', value: 'file:///invalid' },
    { ...baseAction, id: 'manualPrompt', name: 'Manual prompt', kind: 'script', input: 'manual', mac: 'printf manual', windows: '[Console]::Write("manual")' },
  );
  assert.equal((await invoke({ type: 'save', settings })).ok, true);
  for (const id of ['quietSwitch', 'quietDelay']) {
    assert.equal((await invoke({ type: 'run', id })).ok, true);
    const name = settings.workbench.actions.find(a => a.id === id).name;
    await until(async () => { const run = (await invoke({type:'state'})).state.run; return run.name === name && run.status === 'completed'; }, id);
    assert.equal(resultShows, 0, 'Ordinary actions must never flash the result window');
    assert.equal(resultWin.isVisible(), false);
  }
  assert.equal((await invoke({ type: 'run', id: 'visibleFailure' })).ok, true);
  await until(async () => (await invoke({type:'state'})).state.run.status === 'failed' && resultWin.isVisible(), 'necessary failure dialog');
  await resultWin.webContents.executeJavaScript('window.desk.invoke({type:"close"})');
  assert.equal((await invoke({ type: 'run', id: 'manualPrompt' })).ok, true);
  await until(async () => (await invoke({type:'state'})).state.run.status === 'input' && resultWin.isVisible(), 'necessary input dialog');
  await resultWin.webContents.executeJavaScript('window.desk.invoke({type:"cancel"})');
  await until(async () => (await invoke({type:'state'})).state.run.status === 'cancelled' && !resultWin.isVisible(), 'cancel without another popup');
  assert.deepEqual(errors, []);
  writeFileSync(join(smokeDir, 'report.json'), JSON.stringify({ passed: true, simulatedGestures: Boolean(simulatedHook), helper: finished.helper,
    checks: ['eight provider presets and persistence', 'real model test and localized auth error', 'save-and-test persists successful keys with mock keychain', 'failed replacement preserves saved key', 'advanced settings collapsed by default', 'model-test sender validation', '2–12 spokes through real settings UI', 'per-wheel spoke count persistence after reload', 'hidden function restoration', 'dynamic overlay hit alignment', 'settings mounts', 'upstream six-section navigation', 'original effect/function pairs move and autosave', 'empty function slots', '12 original effects', 'original collision/ring/bobbing animations', '12 sounds fetched and decoded', 'preview does not execute actions', 'original wheel geometry/hover/transition', 'custom function labels', 'idle overlay cleanup', 'light and dark themes', 'Chinese language', 'independent branding', 'model listing', 'text-only AI request', 'no AI tools', 'streamed result', 'usage', 'renderer IPC permissions', 'real script action', 'ordinary actions never show result window', 'failure and manual input still show', 'cancellation stays hidden'], rendererErrors: errors }, null, 2));
  console.log('WheelDesk smoke passed', JSON.stringify({ helper: finished.helper }));
  server.close(); app.quit();
}).catch(error => { console.error(error, errors); if (server) server.close(); app.exit(1); });
