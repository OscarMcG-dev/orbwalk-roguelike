import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,Arena,segmentDistance} from '../app/trainer.ts';
const settings={attackSpeed:1.5,windup:22,moveSpeed:325,range:550,difficulty:'standard',mode:'rhythm',quick:false,showRange:true,sound:false};
const setup=()=>{const s=new Simulation(settings);s.start();return s;};
const tick=(s,seconds)=>{for(let i=0;i<Math.round(seconds*120);i++)s.update(1/120);};
test('Movement during windup cancels without firing and moves on next tick',()=>{const s=setup();s.attack(s.targets[0]);tick(s,.05);assert.ok(s.windupLeft>0);const x=s.player.x;s.move({x:300,y:520});tick(s,.1);assert.equal(s.fired,0);assert.equal(s.cancelled,1);assert.ok(s.player.x<x);});
test('After release movement preserves projectile and cooldown',()=>{const s=setup();s.attack(s.targets[0]);tick(s,.2);assert.equal(s.fired,1);assert.ok(s.cooldown>0);const x=s.player.x;s.move({x:300,y:520});tick(s,.1);assert.ok(s.player.x<x);assert.equal(s.cancelled,0);assert.equal(s.fired,1);assert.ok(s.cooldown>0);});
test('Repeated commands cannot bypass attack cooldown',()=>{const s=setup();for(let i=0;i<120;i++){s.attack(s.targets[0]);s.update(1/120);}assert.equal(s.fired,2);assert.equal(s.cancelled,0);});
test('Attack-move selects near cursor and approaches out-of-range target',()=>{const s=setup();s.player={x:80,y:800};s.attack(s.targets[0]);assert.equal(s.target.id,1);tick(s,.1);assert.equal(s.fired,0);assert.ok(s.player.x>80);tick(s,4);assert.ok(s.fired>0);});
test('Movement speed is constant and stops at destination',()=>{const s=setup();s.move({x:1000,y:520});tick(s,.5);assert.ok(Math.abs(s.player.x-812.5)<.01);tick(s,2);assert.equal(s.player.x,1000);});
test('Swept collision detects a projectile crossing the player between samples',()=>{assert.equal(segmentDistance({x:0,y:0},{x:-100,y:0},{x:100,y:0}),0);const s=setup();s.dangers.push({x:550,y:520,vx:24000,vy:0,age:0,delay:0,life:3,radius:13,kind:'line',hit:false,resolved:false});tick(s,1/120);assert.equal(s.hits,1);tick(s,.1);assert.equal(s.hits,1);});
test('Ground burst only hits after warning and counts a dodge once',()=>{const s=setup();s.dangers.push({x:650,y:520,vx:0,vy:0,age:0,delay:.5,life:.8,radius:85,kind:'circle',hit:false,resolved:false});tick(s,.1);assert.equal(s.hits,0);s.move({x:300,y:520});tick(s,1);assert.equal(s.hits,0);assert.equal(s.dodged,1);});
test('Pause freezes all simulation time and 60-second session ends',()=>{const s=setup();s.status='paused';tick(s,5);assert.equal(s.elapsed,0);s.status='running';tick(s,61);assert.equal(s.status,'ended');assert.equal(s.snapshot().time,0);});
test('All pressure levels run through a complete session with finite state',()=>{for(const difficulty of ['easy','standard','hard']){const s=new Simulation({...settings,mode:'mixed',difficulty});s.start();s.attack(s.targets[0]);tick(s,61);assert.equal(s.status,'ended');assert.ok(s.hits+s.dodged>0);assert.ok(s.fired>50);assert.ok(Number.isFinite(s.player.x));}});


const inputArena=()=>{const s=setup();Object.setPrototypeOf(s,Arena.prototype);s.canvas={focus:()=>{}};s.notify=()=>{};s.inside=true;s.heldRight=true;return s;};
const keyEvent=(key,code='',target=null)=>({key,code,target,repeat:false,preventDefault(){this.prevented=true;}});
test('A accepts embedded-browser key events, arms visibly, and replaces held movement',()=>{for(const code of ['', 'Unidentified','KeyA']){const s=inputArena();s.handleKey(keyEvent('a',code));assert.equal(s.armed,true);assert.equal(s.snapshot().phase,'AIMING');assert.equal(s.heldRight,false);}});
test('S cancels movement and held-right state even with pointer outside canvas',()=>{const s=inputArena();s.move({x:1400,y:520});tick(s,.1);s.inside=false;const x=s.player.x;s.handleKey(keyEvent('s'));tick(s,.5);assert.equal(s.player.x,x);assert.equal(s.destination,null);assert.equal(s.heldRight,false);});
test('Focused setup buttons do not swallow A or S, editable text does',()=>{const s=inputArena();s.handleKey(keyEvent('a','',{closest:()=>null}));assert.equal(s.armed,true);s.handleKey(keyEvent('s'));assert.equal(s.armed,false);s.handleKey(keyEvent('a','',{isContentEditable:true}));assert.equal(s.armed,false);});
test('One-key attack command clears held movement and fires',()=>{const s=inputArena();s.settings.quick=true;s.cursor={...s.targets[0]};s.handleKey(keyEvent('a'));tick(s,.2);assert.equal(s.fired,1);assert.equal(s.heldRight,false);});
