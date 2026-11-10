/** Geometry and lifecycle regression for the real header's semantic contract.
 * Native DSH integration and screenshots live in mobile-host.mjs (header section).
 */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const bundle = await readFile('dist/client.js', 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({viewport: {width: 1440, height: 900}, hasTouch: true});
const errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
const settle = () => page.waitForTimeout(120);
const longTitle = '非常长的原生会话标题 Long native session title '.repeat(10);
const fixture = `<!doctype html><html><head><style>
*{box-sizing:border-box}html,body{margin:0;height:100%;font:14px sans-serif}button{font:inherit;cursor:pointer}button:focus-visible{outline:2px solid blue}
.host_frame{height:100%;display:grid;position:relative;grid-template-columns:56px minmax(0,1fr) 0;overflow:hidden}.host_centerCol{display:flex;min-width:0}.host_sidebarCol button{width:32px;height:32px}.host_rightbarCol{min-width:0}
.conv_root{height:100%;display:flex;flex:1;flex-direction:column;min-width:0}.conv_body{display:flex;flex:1;min-height:0}.conv_scrollBody{overflow:auto;flex:1;min-width:0}.conv_header{display:grid;grid-template-columns:auto minmax(0,1fr);flex:none;min-height:76px;padding:10px 28px 0 20px;border-bottom:.5px solid #ddd}.conv_headerLeading{display:flex;grid-area:1/1;align-items:center;gap:8px}.conv_titleRow{grid-column:2;display:flex;align-items:center;min-height:30px;container-type:inline-size}.conv_titleCluster{display:flex;flex:1;min-width:0;gap:10px;align-items:center}.conv_crumbs{display:flex;white-space:nowrap;min-width:0;overflow:hidden}.conv_crumbSeg{display:inline-flex;min-width:0}.conv_crumb{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:4px 8px}.conv_headerActions{display:flex;flex:none;gap:8px;white-space:nowrap}.conv_headerUtilities{display:flex;flex:none;gap:8px;margin-left:20px}.conv_headerCorner{display:flex;flex:none;margin-left:8px;margin-right:-16px}.conv_headerUtilities button,.conv_headerCorner button{width:28px;height:28px;padding:0}.conv_tabs{display:flex;grid-column:1/-1;flex-wrap:wrap;align-items:flex-start;gap:16px 20px;width:100%;min-width:0;margin-top:10px;padding-left:8px}.conv_viewTabs{display:flex;flex-wrap:wrap;gap:32px;min-height:25px;min-width:0}.conv_tab{min-height:25px;padding:0 0 9px;border:0;background:none;line-height:16px;font-size:13px}.conv_viewsMoreAnchor{flex:none}.conv_viewsMore{width:22px;height:22px;margin-top:-3px;padding:0}.conv_tabLabel{display:block;max-width:88px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
textarea{width:90%;max-width:640px;height:64px}.right-panel{position:fixed;right:0;top:42px;width:220px;height:100px;background:#ddd}.portal{position:fixed;right:8px;top:42px;padding:10px;background:#ddd}.portal button{display:block}
</style></head><body><div class="host_frame" data-sidebar-collapsed><aside class="host_sidebarCol"><button class="sidebar_toggle" aria-label="Native sidebar toggle">☰</button><button data-row-key="session:one">会话</button></aside><main class="host_centerCol"><div class="conv_root"><div style="display:contents"><header class="conv_header"><div class="conv_headerLeading"></div><div style="display:contents"><div class="conv_titleRow"><div class="conv_titleCluster"><nav class="conv_crumbs" aria-label="会话层级"><span class="conv_crumbSeg"><span class="conv_crumb">${longTitle}</span></span></nav><div class="conv_headerActions"><span>标准模式</span></div></div><div class="conv_headerUtilities"><button aria-label="打开方式">↗</button><button aria-label="更多操作" aria-haspopup="menu" data-popup="utility">…</button></div><div class="conv_headerCorner"><button aria-label="打开右侧边栏">◧</button></div></div><div class="conv_tabs"><div class="conv_viewTabs" role="tablist">${['对话','轨迹','画布'].map((name,index)=>`<button class="conv_tab" role="tab" aria-selected="${index===0}"><span class="conv_tabLabel">${name}</span></button>`).join('')}</div><span class="conv_viewsMoreAnchor"><button class="conv_viewsMore" aria-label="更多会话视图" aria-haspopup="menu" data-popup="views">…</button></span></div></div></header></div><div class="conv_body"><div class="conv_scrollBody"><textarea aria-label="未发送草稿"></textarea></div></div></div></main><aside class="host_rightbarCol"></aside></div></body></html>`;
async function snapshot() {
  return page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
    const header = document.querySelector('[data-dfl="conversation-header"]');
    return {density: document.querySelector('.conv_root').dataset.dflHeaderDensity, header: rect('.conv_header'), root:rect('.conv_root'), title:rect('.conv_crumbs'), tabs:rect('.conv_tabs'), buttons:[...header.querySelectorAll('button')].filter(el=>el.getClientRects().length).map(el=>({name:el.getAttribute('aria-label')||el.textContent,box:el.getBoundingClientRect().toJSON()}))};
  });
}
try {
  await page.setContent(fixture);
  await page.evaluate(() => {
    const raf = window.requestAnimationFrame.bind(window); window.rafRequests=0; window.requestAnimationFrame=callback=>{window.rafRequests++;return raf(callback)};
    window.__ModuleLoader__={load({factory}){window.plugin=factory(()=>{})}};
    window.toggleSidebar=()=>document.querySelector('.host_frame').toggleAttribute('data-sidebar-collapsed');
    document.querySelector('.sidebar_toggle').onclick=window.toggleSidebar;
    window.nativeHeaderNodes=[...document.querySelectorAll('.conv_header *')];
    window.nativeClicks={};
    for(const button of document.querySelectorAll('.conv_header button')) button.onclick=()=>{
      const name=button.getAttribute('aria-label')||button.textContent;window.nativeClicks[name]=(window.nativeClicks[name]||0)+1;
      if(button.getAttribute('role')==='tab') for(const tab of document.querySelectorAll('[role="tab"]'))tab.setAttribute('aria-selected',String(tab===button));
      if(button.dataset.popup){document.querySelector('.portal')?.remove();const menu=document.createElement('div');menu.className='portal';menu.setAttribute('role','menu');menu.innerHTML='<button role="menuitem">原生菜单项目</button>';document.body.append(menu);menu.querySelector('button').focus();window.returnFocus=button;}
      if(name==='打开右侧边栏'){const panel=document.createElement('div');panel.className='right-panel';panel.innerHTML='<button aria-label="关闭右侧边栏">关闭</button>';panel.firstChild.onclick=()=>panel.remove();document.body.append(panel);}
    };
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.querySelector('.portal')){event.stopImmediatePropagation();document.querySelector('.portal').remove();window.returnFocus?.focus();}});
  });
  await page.addScriptTag({content:bundle});
  await page.evaluate(()=>{window.stopPlugin=window.plugin.install(document,{toggleSidebar:window.toggleSidebar})}); await settle();
  const desktop = await snapshot();
  await page.getByRole('textbox',{name:'未发送草稿'}).fill('旋转前的草稿');
  for(const [width,height] of [[600,375],[667,375],[844,390],[932,430],[1206,465],[1200,240],[800,180],[800,150],[599,375],[600,375],[601,375],[820,599],[820,600],[820,601],[820,599],[390,844],[844,390],[1440,900]]) {
    await page.setViewportSize({width,height});await settle();
    const shot=await snapshot();results.push({width,height,...shot});
    if(width>=600&&height<600&&width>height){
      assert.equal(shot.density,'single');assert.ok(shot.header.height<=44,`single row ${width}x${height}: ${JSON.stringify(shot)}`);
      assert.ok(shot.title.width>=16,'long title keeps visible text');
      for(const {name,box} of shot.buttons)assert.ok(box.left>=shot.header.left-1&&box.right<=shot.header.right+1&&box.top>=shot.header.top-1&&box.bottom<=shot.header.bottom+1,`${name} stays in header: ${JSON.stringify(shot)}`);
      for(let index=1;index<shot.buttons.length;index++)assert.ok(shot.buttons[index].box.left>=shot.buttons[index-1].box.right-1,'focus order follows visual order without overlapping buttons');
    }
    assert.equal(await page.locator('.conv_crumb').textContent(),longTitle,'full title remains in native accessible DOM');
    assert.equal(await page.getByRole('textbox',{name:'未发送草稿'}).inputValue(),'旋转前的草稿');
    assert.ok(await page.evaluate(()=>window.nativeHeaderNodes.every(el=>el.isConnected)),'same native nodes across rotation');
    const count=await page.evaluate(()=>window.rafRequests);await settle();assert.ok(await page.evaluate(()=>window.rafRequests)<=count+1,'settled header does not cause a resize loop');
  }
  assert.equal((await snapshot()).header.height,desktop.header.height,'desktop header restores exactly');
  // A short embedded pane is compact even within a tall desktop.
  await page.locator('.conv_root').evaluate(el=>{el.style.cssText='width:667px;height:240px;flex:none'});await settle();
  assert.equal((await snapshot()).density,'single');assert.equal(await page.locator('html').getAttribute('data-dfl-size'),'wide');
  await page.locator('.conv_root').evaluate(el=>el.removeAttribute('style'));await page.setViewportSize({width:844,height:900});await settle();
  await page.evaluate(()=>Object.defineProperty(window,'visualViewport',{configurable:true,value:{height:390,width:844,offsetTop:0,scale:1,addEventListener(){},removeEventListener(){}}}));
  await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await settle();assert.equal((await snapshot()).density,'single','visual viewport alone activates short header');
  await page.evaluate(()=>{window.visualViewport.scale=2;window.dispatchEvent(new Event('resize'))});await settle();assert.equal((await snapshot()).density,'native','browser zoom does not force short-header layout');
  await page.evaluate(()=>delete window.visualViewport);await page.setViewportSize({width:667,height:375});await settle();
  for(const name of ['对话','轨迹','画布']){const tab=page.getByRole('tab',{name,exact:true});await tab.focus();await page.keyboard.press('Enter');assert.equal(await tab.getAttribute('aria-selected'),'true');}
  for(const name of ['更多操作','更多会话视图']){const button=page.getByRole('button',{name,exact:true});await button.focus();await page.keyboard.press('Enter');assert.ok(await page.getByRole('menuitem').isVisible());await page.keyboard.press('Escape');assert.equal(await button.evaluate(el=>el===document.activeElement),true,'native menu restores focus');}
  await page.getByRole('button',{name:'打开右侧边栏',exact:true}).click();await page.getByRole('button',{name:'关闭右侧边栏',exact:true}).click();
  await page.locator('[data-dfl-toggle]').click();await settle();assert.equal(await page.locator('.host_centerCol').evaluate(el=>el.inert),true);await page.keyboard.press('Escape');await settle();assert.equal(await page.locator('.host_centerCol').evaluate(el=>el.inert),false);
  await page.locator('[data-dfl-toggle]').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'打开方式','native keyboard order is unchanged');
  await page.evaluate(()=>window.stopPlugin());assert.equal(await page.locator('[data-dfl-header-density]').count(),0);assert.equal(await page.locator('.conv_crumb').textContent(),longTitle);
  await mkdir('work/header',{recursive:true});await writeFile('work/header/result.json',JSON.stringify({results,errors},null,2));
  assert.deepEqual(errors,[]);console.log('PASS: compact header geometry, long title, native controls and keyboard focus, short containers, visual viewport/zoom, breakpoint stability, rotation and desktop restoration');
} finally {await browser.close()}
