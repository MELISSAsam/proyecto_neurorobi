// Prueba de interfaz local con dispositivo y API simulados exclusivamente para QA.
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
(async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'neurorobi-standby-'));
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{channel:'chrome'})});
  let active=false,starts=0,stops=0,subscriptions=0,sendReadings=true;const sockets=new Set();const errors=[];
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{const user={id:'qa-user',name:'Profesional QA',email:'qa@example.test',role:'ADMIN'};for(const [key,value]of Object.entries({neurorobi_auth:'true',neurorobi_auth_token:'qa-token',neurorobi_user:JSON.stringify(user),neurorobi_user_role:'ADMIN',neurorobi_user_name:user.name}))localStorage.setItem(key,value);});
    await page.routeWebSocket('**/socket.io/**',ws=>{
      sockets.add(ws);ws.onClose(()=>sockets.delete(ws));
      ws.onMessage(message=>{
        const text=String(message);
        if(text.startsWith('40')){ws.send('40'+JSON.stringify({sid:'qa-socket-'+sockets.size}));ws.send('42'+JSON.stringify(['device-status',{deviceType:'oso',connected:true}]));ws.send('42'+JSON.stringify(['therapy-status',{active}]));}
        else if(text.startsWith('42')){const [event]=JSON.parse(text.slice(2));if(event==='start-stream'){assert.equal(active,true);subscriptions++;if(sendReadings)ws.send('42'+JSON.stringify(['sensor-data',{timestamp:'12:00:01',flexIzq:900,apreton:true,switchIzq:false,switchDer:false,mpu:true,movimiento:20,hugForce:100,rotationX:0,rotationY:0,rotationZ:0,heartRate:-1}]));}}
      });
      ws.send('0'+JSON.stringify({sid:'qa-engine',upgrades:[],pingInterval:25000,pingTimeout:20000,maxPayload:1000000}));
    });
    await page.route('**/api/**',async route=>{
      const url=new URL(route.request().url());let body={};
      if(url.pathname==='/api/patients')body=[{id:'qa-patient',name:'Paciente QA',age:8,diagnosis:'QA',status:'Listo para Consulta',registeredAt:'2026-11-16T12:00:00Z'}];
      else if(url.pathname==='/api/sessions')body=[];
      else if(url.pathname==='/api/telemetry/control'){
        const data=route.request().postDataJSON();if(data.action==='start'){starts++;active=true;}else if(data.action==='stop'){stops++;active=false;}
        body={therapyActive:active};for(const socket of sockets)socket.send('42'+JSON.stringify(['therapy-status',{active}]));
      }
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.goto('http://127.0.0.1:5175/');await page.getByRole('button',{name:'Telemetr\u00eda en Vivo',exact:true}).click({timeout:25000});
    await page.getByRole('heading',{name:'NeuroRobi listo para utilizar'}).waitFor();
    await page.waitForTimeout(1000);assert.equal(starts,0);assert.equal(subscriptions,0);
    const start=page.getByRole('button',{name:'Empezar terapia',exact:true});assert.equal(await start.isDisabled(),true);
    await page.getByLabel('Paciente para terapia').selectOption('qa-patient');assert.equal(await start.isEnabled(),true);
    await page.screenshot({path:path.join(folder,'espera.png'),fullPage:true});
    await start.click();await page.getByRole('heading',{name:'Apreton a lo largo del tiempo'}).waitFor();assert.equal(starts,1);assert.equal(subscriptions,1);
    await page.getByRole('button',{name:/Finalizar.*Guardar Reporte/}).click();
    await page.getByRole('heading',{name:/Informe de interacciones t.ctiles/,exact:true}).waitFor();assert.ok(stops>=1);assert.equal(active,false);
    await page.getByRole('button',{name:'Telemetr\u00eda en Vivo',exact:true}).click();await page.getByText('Hay un informe pendiente.',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'Empezar terapia',exact:true}).isDisabled(),true);
    sendReadings=false;
    await page.reload();await page.getByRole('button',{name:'Telemetr\u00eda en Vivo',exact:true}).click({timeout:25000});
    await page.getByRole('heading',{name:'NeuroRobi listo para utilizar'}).waitFor();
    await page.getByLabel('Paciente para terapia').selectOption('qa-patient');await page.getByRole('button',{name:'Empezar terapia',exact:true}).click();
    await page.getByRole('heading',{name:'Apreton a lo largo del tiempo'}).waitFor();
    await page.getByRole('button',{name:/Finalizar.*Guardar Reporte/}).click();
    await page.getByRole('heading',{name:'NeuroRobi listo para utilizar'}).waitFor();assert.equal(active,false);assert.equal(starts,2);
    assert.deepEqual(errors,[]);console.log('PASS: espera sin suscripcion ni inicio automatico, paciente requerido, inicio explicito, parada al finalizar e informe pendiente protegido.');console.log('Captura QA:',folder);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
