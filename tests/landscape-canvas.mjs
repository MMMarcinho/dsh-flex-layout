/** Native conversation DOM contract + actual canvas CSS. No model calls. */
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import { launchBrowser } from './browser-launch.mjs';
const bundle=await readFile('dist/client.js','utf8');
const canvasCss=process.env.DSH_CANVAS_CSS ? await readFile(process.env.DSH_CANVAS_CSS,'utf8') : await readFile('tests/fixtures/canvas-layout.css','utf8');
const browser=await launchBrowser();
const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const settle=()=>page.waitForTimeout(200);
try {
await page.setContent(`<html><head><style>${canvasCss}</style><style>
html,body{height:100%;margin:0}*{box-sizing:border-box}.host_frame{height:100%;display:grid;grid-template-columns:0 minmax(0,1fr) 0;position:relative}.host_centerCol{display:flex;min-width:0}.conv_root{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}.conv_header{height:42px;flex:none}.conv_body{flex:1;min-height:0;display:flex;flex-direction:column}.conv_scrollBody{display:flex;flex:1;flex-direction:column;min-height:0;position:relative;overflow:auto}.conv_viewArea{position:relative;flex:1;min-height:0}.conv_composerSeat{display:flex;flex-direction:column;flex:none}.input_root{min-height:0}.input_card{background:#eef;border-radius:14px}.input_input{min-height:64px;overflow:auto}.input_row{display:flex;height:40px}.input_standardControls{display:flex;justify-content:space-between;width:100%}.chat-user-message{height:52px;flex:none;background:#eef;border-radius:12px;margin-bottom:6px;padding:8px}.chat-user-history{gap:0}button{min-height:32px}
</style></head><body><div class="host_frame" data-sidebar-collapsed data-sidebar-drawer><aside class="host_sidebarCol"></aside><main class="host_centerCol"><div class="conv_root"><header class="conv_header">会话标题 · 画布</header><div class="conv_body" data-conversation-content><div class="conv_scrollBody" data-conversation-scroll><div class="conv_viewArea"><div class="canvas-conversation-view" data-canvas-conversation-view><div class="canvas-app chat-canvas"><div class="chat-stage"><div class="chat-world"><div class="chat-reply">回复</div></div></div><div class="chat-topbar"><button id="menu">侧边栏</button></div><div class="chat-dock"><div class="chat-user-history-frame"><div class="chat-user-history">${Array.from({length:10},(_,i)=>`<div class="chat-user-message" tabindex="0">用户消息 ${i}</div>`).join('')}</div></div></div></div></div></div><div class="conv_composerSeat" data-composer-seat><div class="input_root"><div class="input_card"><div class="input_scroll"><div class="input_input" contenteditable="true" role="textbox">未发送草稿</div></div><div class="input_row"><div class="input_standardControls"><button>附件</button><button id="send">发送</button></div></div></div><div data-composer-dock>详细信息</div></div></div></div></div></div></main><aside class="host_rightbarCol"></aside></div></body></html>`);
await page.evaluate(()=>{const raf=requestAnimationFrame.bind(window);window.rafs=0;window.requestAnimationFrame=cb=>{window.rafs++;return raf(cb)};window.__ModuleLoader__={load({factory}){window.plugin=factory(()=>{})}};window.sends=0;document.querySelector('#send').onclick=()=>window.sends++});
await page.addScriptTag({content:bundle});await page.evaluate(()=>window.stopPlugin=window.plugin.install(document,{toggleSidebar(){}}));
const sizes=[[844,390],[667,375],[932,430],[1206,465],[600,320],[800,240],[390,844],[198,242],[844,390],[1440,900]];
for(const [width,height] of sizes){
 await page.setViewportSize({width,height});await settle();
 const m=await page.evaluate(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();return {mode:document.querySelector('.conv_body').dataset.dflCanvasLayout,stage:rect('.chat-stage'),dock:rect('.chat-dock'),rail:rect('.chat-user-history'),seat:rect('[data-composer-seat]'),body:rect('.conv_body')}});
 if(m.mode==='split'){
 assert.ok(Math.abs(m.stage.right-m.dock.left)<2,`stage and rail adjacent ${width} ${JSON.stringify(m)}`);
 assert.ok(Math.abs(m.dock.left-m.seat.left)<2,`rail and composer same column ${width} ${JSON.stringify(m)}`);
 assert.ok(Math.abs(m.dock.bottom-m.seat.top)<2,`rail above composer ${width} ${JSON.stringify(m)}`);
 assert.ok(m.rail.height>=48,`at least one readable message ${width}: ${m.rail.height}`);
 assert.ok(m.stage.height>=m.body.height-2,'canvas gets full height');
 assert.ok(m.seat.bottom<=height+1&&m.rail.top>=m.body.top-1,`no clipping ${width}x${height} ${JSON.stringify(m)}`);
 assert.equal(await page.locator('.canvas-app').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)','spanning canvas must not paint over native input');
 await page.locator('#send').click();
 await page.locator('.chat-user-history').evaluate(el=>el.scrollTop=120);assert.ok(await page.locator('.chat-user-history').evaluate(el=>el.scrollTop)>0,'rail scrolls');
 }
 const rafs=await page.evaluate(()=>window.rafs);await settle();assert.ok(await page.evaluate(()=>window.rafs)<=rafs+1,'no resize feedback loop');
}
await page.setViewportSize({width:844,height:390});await settle();
await page.locator('.input_input').evaluate(el=>el.style.height='160px');await settle();
let m=await page.evaluate(()=>({rail:document.querySelector('.chat-dock').getBoundingClientRect().bottom,seat:document.querySelector('[data-composer-seat]').getBoundingClientRect().top}));assert.ok(Math.abs(m.rail-m.seat)<2,'growing draft keeps rail above composer');
await page.locator('.input_input').evaluate(el=>el.style.height='');await settle();
await mkdir('work/canvas-layout',{recursive:true});await page.screenshot({path:'work/canvas-layout/844x390.png'});
assert.equal(await page.getByRole('textbox').innerText(),'未发送草稿');assert.ok(await page.evaluate(()=>window.sends)>=6);assert.deepEqual(errors,[]);
await page.evaluate(()=>window.stopPlugin());assert.equal(await page.locator('[data-dfl-canvas-layout]').count(),0);
console.log('PASS: landscape canvas/rail/composer alignment, readable scroll, growing draft, hit-testing, rotation/watch/desktop and resize-loop checks');
} finally {await browser.close()}
