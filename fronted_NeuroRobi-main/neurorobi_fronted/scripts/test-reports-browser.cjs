// QA local: las respuestas API son fixtures sinteticos; no se escriben pacientes reales.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'neurorobi-reports-'));
const readings=Array.from({length:121},(_,i)=>({timestamp:`12:00:${String(Math.floor(i/2)%60).padStart(2,'0')}`,elapsedMs:i*500,flexIzq:i%10>4?1800:450,apreton:i%10>4,mpu:true,movimiento:i%20>15?80:2,switchIzq:i%16>12,switchDer:false}));
const patient={id:'qa-p1',name:'Paciente QA',age:8,diagnosis:'Registro de prueba',registeredAt:'2026-11-16T12:00:00Z',status:'Listo para Consulta'};
const session=(id,date)=>({id,patientId:patient.id,patientName:patient.name,date,durationSeconds:60,specialistName:'Profesional QA',specialistRole:'PSICOLOGIA_CLINICA',deviceType:'oso',metrics:{},notes:'Observacion de prueba local.',sensorHistory:readings,spikesLog:[]});
const sessions=[session('qa-session-1','2026-11-16T12:00:00Z'),session('qa-session-2','2026-11-15T12:00:00Z')];
let savedNotes='';const errors=[];
const browser=await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {channel:'chrome'})});try{
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{const user={id:'qa-therapist',name:'Profesional QA',email:'qa@example.test',role:'ADMIN'};localStorage.setItem('neurorobi_user',JSON.stringify(user));localStorage.setItem('neurorobi_auth','true');localStorage.setItem('neurorobi_auth_token','qa-token');localStorage.setItem('neurorobi_user_role','ADMIN');localStorage.setItem('neurorobi_user_name',user.name);});
await page.route('**/api/**',async route=>{const url=new URL(route.request().url());let body={};if(url.pathname==='/api/patients')body=[patient];else if(url.pathname==='/api/sessions')body=sessions;else if(url.pathname.endsWith('/notes')){savedNotes=route.request().postDataJSON().notes;body={notes:savedNotes};}else if(url.pathname==='/api/stats')body={totalPatients:1,totalSessions:2,activePatients:0,recentSessions:[]};await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});});
await page.goto('http://127.0.0.1:5175/');await page.getByRole('button',{name:'Historial de sesiones',exact:true}).click({timeout:25000});
await page.getByRole('heading',{name:'Apreton a lo largo del tiempo',exact:true}).waitFor();await page.getByRole('heading',{name:'Intensidad de sacudidas',exact:true}).waitFor();
const graph=page.getByRole('img',{name:'Apreton a lo largo del tiempo'});const box=await graph.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.getByText(/Instante 00:/).first().waitFor();
await page.getByLabel('Observaciones del terapeuta').fill('Observacion QA guardada desde el navegador.');await page.getByRole('button',{name:'Guardar observaciones',exact:true}).click();await page.waitForTimeout(250);assert.equal(savedNotes,'Observacion QA guardada desde el navegador.');
const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar informe PDF',exact:true}).click();const pdf=await download;const pdfPath=path.join(folder,'informe.pdf');await pdf.saveAs(pdfPath);const bytes=fs.readFileSync(pdfPath);assert.ok(bytes.subarray(0,5).toString()==='%PDF-');assert.ok(bytes.length>15000);assert.ok(bytes.toString('latin1').includes('Apreton relativo durante'));
await page.screenshot({path:path.join(folder,'historial-desktop.png'),fullPage:true});
await page.getByRole('button',{name:'Evoluci\u00f3n de interacciones',exact:true}).click();await page.getByLabel('Paciente',{exact:true}).selectOption(patient.id);for(const checkbox of await page.getByRole('checkbox').all())await checkbox.check();
await page.getByText('Variaciones f\u00edsicas registradas.',{exact:false}).waitFor();const comparative=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar informe PDF comparativo'}).click();await (await comparative).saveAs(path.join(folder,'evolucion.pdf'));
await page.getByRole('button',{name:'Reporte individual',exact:true}).click();await page.getByLabel('Tipo de interacci\u00f3n').selectOption('Sacudida fuerte');assert.equal(await page.locator('tbody tr').filter({hasText:'Apreton'}).count(),0);
await page.getByLabel('Desde',{exact:true}).fill('2026-11-16');assert.equal(await page.getByText('qa-session-2',{exact:true}).count(),0);
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await page.screenshot({path:path.join(folder,'historial-mobile.png'),fullPage:true});
assert.deepEqual(errors,[]);console.log('PASS: historial, graficas interactivas, observaciones PATCH, PDF individual/comparativo, filtro de eventos/fechas y ancho movil.');console.log('Artefactos QA locales:',folder);
}catch(error){console.log('Errores de pagina:',errors);console.log((await browser.contexts()[0]?.pages()[0]?.locator('body').innerText())?.slice(0,1600));throw error;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
