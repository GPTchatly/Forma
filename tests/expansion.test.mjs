import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, THEMES, GROUPS } from '../shared/catalog.mjs';
import { EXPANSION_BLOCKS, ANCHORED_GROUPS } from '../shared/expansion.mjs';
import { BLOCK_MANIFESTS } from '../shared/blocks.mjs';
import { STYLE_PRESETS, styleTheme } from '../shared/styles.mjs';
import { WIDGETS, makeWidget, widgetFields } from '../shared/widgets.mjs';
import { SHOWCASES, makeShowcase } from '../shared/showcases.mjs';
import { createSpec, makeSection } from '../shared/content.mjs';
import { validateSpec, validateCompose } from '../shared/schema.mjs';
import { renderBody } from '../shared/render.mjs';
import { applyMove, libraryOptions, setPartRemoved } from '../shared/structure.mjs';
import { compose } from '../server/composer.mjs';
import { demoEvaluate } from '../server/demo.mjs';
import { prepareComposeRequest } from '../shared/compose-transport.mjs';
import { PNG_IMAGE } from './fixtures/images.mjs';

const request=(spec,prompt,extra={})=>({spec,prompt,operation:'edit',mode:'demo',locks:{},...extra});

test('expanded inventory counts concrete compositions separately from styles and elements',()=>{
  assert.equal(CATALOG.length,105+BLOCK_MANIFESTS.length);assert.equal(new Set(CATALOG.map(entry=>entry.id)).size,105+BLOCK_MANIFESTS.length);
  assert.equal(EXPANSION_BLOCKS.length,60+BLOCK_MANIFESTS.length);assert.equal(Object.keys(WIDGETS).length,24);
  assert.equal(Object.keys(STYLE_PRESETS).length,12);assert.equal(Object.keys(THEMES).length,12);
  assert.equal(Object.keys(SHOWCASES).length,8);assert.equal(GROUPS.length,16);
  assert.ok(EXPANSION_BLOCKS.every(entry=>entry.source==='Forma original · MIT'));
});

test('version one migration preserves authored values and adds bounded defaults',()=>{
  const old=createSpec();old.schemaVersion=1;delete old.theme.style;
  old.sections[1].title='Preserve this heading';old.sections[1].image=PNG_IMAGE;old.sections[1].locked=true;
  const snapshot=structuredClone(old),next=validateSpec(old);
  assert.deepEqual(old,snapshot);assert.equal(next.schemaVersion,2);assert.equal(next.theme.style,'default');
  for(const section of next.sections){assert.deepEqual(section.widgets,[]);assert.equal(section.id,old.sections.find(entry=>entry.id===section.id).id);}
  assert.equal(next.sections[1].image,PNG_IMAGE);assert.equal(next.sections[1].title,'Preserve this heading');assert.equal(next.sections[1].locked,true);
  assert.deepEqual(validateSpec(next),next,'normalization is idempotent');
});

test('repeatable bodies use stable identities and independently address insertion, replacement and removal',()=>{
  const page=validateSpec(createSpec());
  const inserted=applyMove(page,{kind:'insert-section',pageId:'home',blockId:'gallery-filter',beforeSectionId:'footer'},'home');
  assert.equal(inserted.allowed,true);assert.equal(inserted.changed,true);
  const galleries=inserted.page.sections.filter(entry=>entry.group==='gallery');assert.equal(galleries.length,2);assert.notEqual(galleries[0].id,galleries[1].id);
  const choices=libraryOptions(inserted.page,{kind:'section',blockId:'gallery-masonry'},'home');
  assert.ok(choices.some(entry=>entry.proposal.kind==='replace-section'&&entry.proposal.sectionId===galleries[1].id));
  const replaced=applyMove(inserted.page,{kind:'replace-section',pageId:'home',sectionId:galleries[1].id,blockId:'gallery-masonry'},'home');
  assert.equal(replaced.page.sections.find(entry=>entry.id===galleries[0].id).block,galleries[0].block);
  assert.equal(replaced.page.sections.find(entry=>entry.id===galleries[1].id).block,'gallery-masonry');
  for(const group of ANCHORED_GROUPS){const duplicate=structuredClone(page);duplicate.sections.push({...makeSection(group),id:'duplicate-'+group});assert.throws(()=>validateSpec(duplicate));}
  const legacy=structuredClone(inserted.page);legacy.schemaVersion=1;assert.throws(()=>validateSpec(legacy));
  const locked=structuredClone(inserted.page);locked.sections.find(entry=>entry.id===galleries[1].id).locked=true;
  assert.equal(applyMove(locked,{kind:'replace-section',pageId:'home',sectionId:galleries[1].id,blockId:'gallery-thumbnails'},'home').allowed,false);
});

test('every new block uses escaped authored rendering and no network-selected code',()=>{
  for(const entry of EXPANSION_BLOCKS){
    const spec=createSpec();spec.sections=[makeSection(entry.group,entry.id)];
    const section=spec.sections[0];section.title='<script>bad()</script>';section.body='Unsafe <img src=x onerror=bad()>';
    for(const item of section.items){item.title='Item <img src=x>';item.body='<script>itemBad()</script>';item.meta='<img src=x>';}
    const html=renderBody(spec,{preview:true});
    assert.ok(html.includes('data-xp-block="'+entry.behavior+'"'),entry.id);
    assert.ok(!/<script>|<img src=x|onerror="/.test(html),entry.id);
    assert.ok(!/src="https?:|href="javascript:/.test(html),entry.id);
    for(const item of section.items) assert.ok(html.includes('data-item-id="'+item.id+'"'),entry.id+' '+item.id);
  }
});

test('new removable parts change actual table, form and pricing markup',()=>{
  for(const block of ['app-analytics','pricing-matrix','pricing-period','app-billing','app-project','app-onboarding']){
    const spec=validateSpec({...createSpec(),sections:[makeSection('hero',block.startsWith('app-')?block:undefined)]});
    if(!block.startsWith('app-')) spec.sections=[makeSection('pricing',block)];
    const section=spec.sections[0];section.items[0].title='Distinct removable title';section.items[0].body='Distinct removable body';section.items[0].price='Distinct removable price';
    section.items[0].removedParts=['heading','body','price','control','action'];
    const html=renderBody(spec);assert.ok(!html.includes('Distinct removable body'),block);assert.ok(!html.includes('Distinct removable price'),block);
    // Step indexes and project navigation keep accessible labels when an item heading is removed.
    if(!['app-onboarding','app-project'].includes(block))assert.ok(!html.includes('Distinct removable title'),block);
  }
});

test('element envelopes reject unknown kinds, executable links, excess capacity and absent page targets',()=>{
  const spec=validateSpec(createSpec());const section=spec.sections.find(entry=>entry.group==='hero');section.widgets=[makeWidget('dialog','dialog-1')];
  for(const mutation of [widget=>widget.kind='script',widget=>widget.href='javascript:alert(1)',widget=>widget.options=Array(9).fill('x'),widget=>widget.script='bad',widget=>widget.slot='head']){
    const bad=structuredClone(spec);mutation(bad.sections.find(entry=>entry.id===section.id).widgets[0]);assert.throws(()=>validateSpec(bad));
  }
  section.widgets=Array.from({length:5},(_,index)=>makeWidget('dialog','dialog-'+index));assert.throws(()=>validateSpec(spec));
  section.widgets=[makeWidget('menu','menu')];section.widgets[0].href='page:missing';assert.throws(()=>validateSpec(spec));
  const nav=spec.sections[0];nav.widgets=[makeWidget('dialog','bad-slot')];assert.throws(()=>validateSpec(spec));
});

test('every reusable element renders bounded escaped text and typed behavior',()=>{
  for(const kind of Object.keys(WIDGETS)){
    const spec=validateSpec(createSpec());const section=spec.sections[1];const widget=makeWidget(kind,'element');
    widget.label='<img src=x>';widget.body='<script>bad()</script>';widget.options=['Unsafe <img src=x>','Next','Last'];section.widgets=[widget];
    const html=renderBody(spec);assert.ok(html.includes('data-xp-widget="'+kind+'"'));assert.ok(!html.includes('<script>')&&!html.includes('<img src=x>'));
    assert.ok(widgetFields(kind).includes('label'));assert.ok(html.includes('&lt;img src=x&gt;'));
  }
});

test('styles honor locks and showcases cover all styles and reusable elements',()=>{
  const source=createSpec().theme;const locked=styleTheme(source,'brutalist',{palette:true,font:true});
  assert.equal(locked.palette,source.palette);assert.equal(locked.font,source.font);assert.equal(locked.style,'brutalist');assert.equal(locked.radius,'sharp');
  assert.deepEqual(styleTheme(source,'glass',{style:true}),source);assert.throws(()=>styleTheme(source,'external'));
  const styles=new Set(),widgets=new Set();
  for(const key of Object.keys(SHOWCASES)){const spec=makeShowcase(key);assert.equal(spec.schemaVersion,2);assert.ok(spec.sections.length<=12);styles.add(spec.theme.style);for(const page of spec.pages)styles.add(page.theme.style);for(const section of spec.sections)for(const widget of section.widgets)widgets.add(widget.kind);assert.ok(renderBody(spec).includes('style-'+spec.theme.style));}
  assert.deepEqual([...styles].sort(),Object.keys(STYLE_PRESETS).sort());assert.deepEqual([...widgets].sort(),Object.keys(WIDGETS).sort());
});

test('composition edits selected repeated identities and preserves other owners',async()=>{
  const spec=validateSpec(createSpec());const extra=makeSection('features','features-media');extra.id='features-extra';spec.sections.splice(-1,0,extra);
  const before=structuredClone(spec),selected=spec.sections.find(entry=>entry.id===extra.id);
  const result=await compose(request(spec,'Set this section heading to "A distinct second section".',{selectedSectionId:selected.id}),demoEvaluate);
  assert.equal(result.spec.sections.find(entry=>entry.id===selected.id).title,'A distinct second section');
  assert.deepEqual(result.spec.sections.find(entry=>entry.id==='features'),before.sections.find(entry=>entry.id==='features'));
  assert.ok(result.report.changes.some(entry=>entry.target==='sections.features-extra.title'));
  assert.deepEqual(spec,before);
  const again=await compose(request(spec,'Add another gallery section.'),demoEvaluate);assert.equal(again.spec.sections.filter(entry=>entry.group==='gallery').length,2);
});

test('styles, new app screens and prepared elements are available without invented model output',async()=>{
  const spec=createSpec();
  const styled=await compose(request(spec,'Apply Neo-Brutalist style and add a Command palette.',{selectedSectionId:'hero'}),demoEvaluate);
  assert.equal(styled.spec.theme.style,'brutalist');assert.equal(styled.spec.sections.find(entry=>entry.id==='hero').widgets[0].kind,'command');assert.equal(styled.report.calls,0);
  for(const id of ['app-files','app-notifications','app-help']){const result=await compose(request(spec,'Create a '+id+' interface.'),demoEvaluate);assert.equal(result.spec.sections.find(entry=>entry.group==='hero').block,id);}
});

test('largest repeatable page stays within two bounded decision passes',async()=>{
  const spec=validateSpec(createSpec());spec.sections=[makeSection('hero','hero-browser'),...Array.from({length:10},(_,index)=>({...makeSection('features',index%2?'features-tabs':'features-cards'),id:'features-'+index})),makeSection('footer','footer-sitemap')];
  for(const section of spec.sections.filter(entry=>entry.group==='features'))section.items=Array.from({length:8},(_,index)=>({...structuredClone(section.items[index%3]),id:'item-'+index}));
  const sizes=[];const result=await compose(request(spec,'Make this page visually coherent.',{selectedSectionId:'features-5'}),async input=>{sizes.push(Object.keys(input.questions).length);assert.ok(Object.values(input.questions).every(question=>Object.keys(question.criteria).length<=255));return demoEvaluate(input);});
  assert.equal(sizes.length,2);assert.ok(sizes.every(size=>size<=160));assert.equal(result.spec.sections.length,12);assert.equal(result.spec.sections.filter(entry=>entry.group==='features').length,10);
});

test('uploaded media remains outside compose transport while element values persist',()=>{
  const spec=makeShowcase('store');spec.sections[1].items[0].image=PNG_IMAGE;spec.sections[1].widgets[0].body='Owner-authored message';
  const envelope=prepareComposeRequest(request(spec,'Keep this design.')).request;assert.ok(!JSON.stringify(envelope).includes(PNG_IMAGE));
  assert.ok(JSON.stringify(envelope).includes('Owner-authored message'));assert.equal(validateCompose(request(spec,'Keep this design.')).spec.schemaVersion,2);
});
