// Synthetic fixtures for UI validation only. No request reaches production services.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'neurorobi-admin-ui-'));
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{channel:'chrome'})});const errors=[];
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 const superUser={id:'qa-super',name:'Superadministrador QA',email:'super@example.test',role:'ADMIN',accessLevel:'SUPERADMINISTRADOR',institutionId:'qa-i',clinicalRead:false,mustChangePassword:false};
 const institutions=[{id:'qa-i',name:'Institucion QA',contact:'Contacto QA',active:true,_count:{users:1,patients:0,devices:0}}],users=[{...superUser,active:true,createdAt:'2026-11-17T12:00:00Z',lastLoginAt:null}],devices=[],actions=[];
 let sessionHours='8';
 await page.addInitScript(()=>{localStorage.setItem('neurorobi_auth_token','synthetic-token');localStorage.setItem('neurorobi_auth','true');});
 await page.route('**/api/**',async route=>{
  const req=route.request(),u=new URL(req.url()),method=req.method(),body=method==='GET'?null:req.postDataJSON();let result={};
  if(u.pathname==='/api/auth/me')result=superUser;
  else if(u.pathname==='/api/admin/overview')result={institutions,users:[{accessLevel:'SUPERADMINISTRADOR',active:true,_count:1}],patients:0,sessions:0,devices,interactions:{pulses:0,squeezes:0,shakes:0},byInstitution:institutions.map(i=>({name:i.name,sessions:0})),byDay:[],recent:[],activity:actions};
  else if(u.pathname==='/api/admin/users'){
   if(method==='POST'){assert.equal(body.accessLevel,'TERAPEUTA');users.push({...body,id:'qa-therapist',createdAt:'2026-11-17T12:00:00Z',mustChangePassword:true});actions.push({id:'action-1',actorName:superUser.name,createdAt:'2026-11-17T12:00:00Z',action:'USER_CREATE',resource:'qa-therapist',result:'SUCCESS'});result=users.at(-1);}else{const q=u.searchParams.get('q')||'';result={items:users.filter(i=>i.name.includes(q)||i.email.includes(q)),total:users.length,page:1};}
  }else if(u.pathname==='/api/admin/users/qa-therapist'&&method==='PATCH'){Object.assign(users[1],body);result=users[1];}
  else if(u.pathname.endsWith('/reset')){assert.ok(body.password.length>=12);result={message:'Acceso temporal preparado'};}
  else if(u.pathname==='/api/admin/institutions'){
   if(method==='POST'){institutions.push({...body,id:'qa-i-2',_count:{users:0,patients:0,devices:0}});result=institutions.at(-1);}else result={items:institutions,total:institutions.length,page:1};
  }else if(u.pathname==='/api/admin/devices'){
   if(method==='POST'){devices.push({...body,deviceId:body.id,connected:false,therapyActive:false,lastSeenAt:null});result={id:body.id,deviceKey:'synthetic-one-time-device-key'};}else result={items:devices,total:devices.length,page:1};
  }else if(u.pathname==='/api/admin/audit')result={items:actions,total:actions.length,page:1};
  else if(u.pathname==='/api/admin/settings'){if(method==='PUT')sessionHours=body.value;result={items:[{key:'sessionHours',value:sessionHours}],multiUserEnabled:true};}
  await route.fulfill({status:method==='POST'&&['/api/admin/users','/api/admin/devices','/api/admin/institutions'].includes(u.pathname)?201:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto('http://127.0.0.1:5175/');await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor({timeout:25000});assert.equal(await page.getByRole('button',{name:'Historial de sesiones',exact:true}).count(),0);
 await page.screenshot({path:path.join(folder,'dashboard-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'Gestion de usuarios',exact:true}).click();await page.getByRole('button',{name:'Nuevo usuario',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Nombres y apellidos').fill('Terapeuta QA');await dialog.getByLabel('Correo electronico').fill('terapeuta@example.test');await dialog.getByLabel('Contrasena temporal').fill('synthetic-temporary-password');await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.getByText('Terapeuta QA',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Editar Terapeuta QA',exact:true}).click();await dialog.getByLabel('Cuenta o recurso activo').uncheck();await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.getByText('Inactivo',{exact:true}).waitFor();assert.equal(users[1].active,false);
 const row=page.locator('tr').filter({hasText:'Terapeuta QA'});await row.getByRole('button',{name:'Restablecer acceso',exact:true}).click();await dialog.getByLabel('Contrasena temporal').fill('synthetic-reset-password');await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.getByText('Acceso temporal preparado',{exact:true}).waitFor();
 await page.getByLabel('Buscar registros').fill('sin-resultados');await page.getByText('No hay usuarios que coincidan con los filtros.').waitFor();
 await page.getByRole('button',{name:'Instituciones',exact:true}).click();await page.getByRole('button',{name:'Nueva institucion',exact:true}).click();await dialog.getByLabel('Nombre',{exact:true}).fill('Segunda institucion QA');await dialog.getByLabel('Contacto',{exact:true}).fill('Contacto ficticio');await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.getByRole('cell',{name:'Segunda institucion QA',exact:true}).waitFor();
 await page.getByRole('button',{name:'Dispositivos NeuroRobi',exact:true}).click();await page.getByRole('button',{name:'Registrar oso',exact:true}).click();await dialog.getByLabel('Nombre',{exact:true}).fill('Oso QA');await dialog.getByLabel('Identificador unico del oso').fill('oso-qa');await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.getByLabel('Clave del dispositivo',{exact:true}).waitFor();assert.equal(await page.getByLabel('Clave del dispositivo',{exact:true}).inputValue(),'synthetic-one-time-device-key');assert.ok(!await page.evaluate(()=>JSON.stringify(localStorage).includes('synthetic-one-time-device-key')));await page.getByRole('button',{name:'Ya guarde la clave',exact:true}).click();assert.equal(await page.getByLabel('Clave del dispositivo',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Roles y permisos',exact:true}).click();await page.getByRole('heading',{name:'Permisos por nivel de acceso',exact:true}).waitFor();
 await page.getByRole('button',{name:'Auditoria',exact:true}).click();await page.getByText('USER_CREATE',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Configuracion general',exact:true}).click();await page.getByLabel('Vigencia de las nuevas sesiones (horas)').fill('4');assert.equal(await page.getByLabel('Permitir acceso a multiples usuarios').isChecked(),true);await page.getByRole('button',{name:'Guardar configuracion',exact:true}).click();await page.getByText('Cambios guardados.',{exact:true}).waitFor();assert.equal(sessionHours,'4');
 await page.getByRole('button',{name:'Estadisticas y sesiones',exact:true}).click();await page.getByRole('heading',{name:'Sesiones recientes',exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await page.screenshot({path:path.join(folder,'statistics-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: eight sections; account create/edit/reset; institution create; one-time device key; search; configuration; clinical menu restriction; mobile width; no runtime exceptions.');console.log('UI artifacts:',folder);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
