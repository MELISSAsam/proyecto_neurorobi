// Datos sinteticos usados exclusivamente como pruebas; no se cargan en la aplicacion.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const file=path.join(__dirname,'../src/utils/interactions.ts');const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const moduleExport={};vm.runInNewContext(output,{exports:moduleExport,require});const {analyze,chartPoints}=moduleExport;
const sample=(ms,apreton=false,movimiento=0,extra={})=>({elapsedMs:ms,flexIzq:apreton?900:450,apreton,mpu:true,movimiento,switchIzq:false,switchDer:false,...extra});
let r=analyze([sample(0),sample(100,true),sample(200,true,70),sample(300,true,70),sample(400,false,0)]);
assert.equal(r.contacts,1);assert.equal(r.shakes,1);assert.ok(Math.abs(r.squeezeDuration-0.3)<1e-9);assert.equal(r.events.filter(e=>e.kind==='Apreton').length,1);assert.equal(r.events.find(e=>e.kind==='Sacudida fuerte').partial,false);
r=analyze([sample(0),sample(100,true),sample(200,true),sample(6000,true),sample(6100,false)]);assert.equal(r.hasGaps,true);assert.equal(r.contacts,2);assert.ok(r.squeezeDuration<0.21);assert.equal(r.events.every(e=>e.partial),true);
r=analyze([sample(0,true),sample(100,true)]);assert.equal(r.events[0].partial,true);
r=analyze([sample(0,false,90,{mpu:false})]);assert.equal(r.shakes,null);assert.equal(r.points[0].movement,null);
r=analyze([{timestamp:'23:59:59',flexIzq:0,apreton:false},{timestamp:'00:00:00',flexIzq:900,apreton:true},{timestamp:'00:00:01',flexIzq:0,apreton:false}]);assert.equal(r.points[2].t,2);assert.equal(r.squeezeDuration,1);
r=analyze([{receivedAt:'2026-11-16T12:00:00.000Z',flexIzq:4095},{receivedAt:'2026-11-16T12:00:00.250Z',flexIzq:0}]);assert.equal(r.pressureMax,100);assert.equal(r.points[1].t,0.25);
r=analyze([{timestamp:'12:00:00',hugForce:100}]);assert.equal(r.pressureMax,null);assert.equal(r.contacts,null);
r=analyze([]);assert.equal(r.contacts,null);assert.equal(r.pressureMax,null);assert.equal(r.events.length,0);
const many=Array.from({length:5000},(_,i)=>({t:i/10,pressure:i===2511?100:0,movement:0}));assert.ok(chartPoints(many,'pressure').some(p=>p.pressure===100));
r=analyze([{elapsedMs:0,apreton:true},{elapsedMs:100,apreton:false}]);assert.equal(r.events[0].max,null);assert.equal(r.events[0].avg,null);
console.log('PASS: contactos por transicion, duraciones a 10Hz, cortes de senal, eventos incompletos, sensor ausente, cambio de dia, fechas UTC, ausencia de datos y conservacion de picos.');
