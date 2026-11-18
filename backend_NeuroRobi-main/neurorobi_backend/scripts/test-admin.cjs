// Integration test: all accounts, records and keys below are synthetic and use a temporary database.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn,spawnSync}=require('node:child_process'),Database=require('better-sqlite3');
const root=path.resolve(__dirname,'..'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'neurorobi-admin-'));
const {io}=require(path.resolve(root,'../../fronted_NeuroRobi-main/neurorobi_fronted/node_modules/socket.io-client'));
const env={...process.env,NODE_ENV:'production',SEED_DEMO_DATA:'false',MULTI_USER_ENABLED:'true',DATABASE_URL:`file:${path.join(folder,'test.db').replaceAll('\\','/')}`,UPLOADS_DIR:path.join(folder,'uploads'),JWT_SECRET:'qa-isolated-secret-with-at-least-32-characters',SINGLE_USER_USERNAME:'qa-super',SINGLE_USER_PASSWORD:'synthetic-super-password-123',SUPERADMIN_EMAIL:'',SUPERADMIN_PASSWORD:'',INITIAL_ADMIN_EMAIL:'',INITIAL_ADMIN_PASSWORD:'',LEGACY_DEVICE_ID:'oso-principal',TELEMETRY_API_KEY:'synthetic-legacy-device-key',THERAPY_LEASE_MS:'12000',PORT:'44101',REGISTRY_PORT:'44100',AUTH_PORT:'44102',PATIENT_PORT:'44103',SESSION_PORT:'44104',TELEMETRY_PORT:'44105',REGISTRY_URL:'http://127.0.0.1:44100',SERVICE_HOSTNAME:'127.0.0.1',AUTH_SERVICE_URL:'http://127.0.0.1:44102',PATIENT_SERVICE_URL:'http://127.0.0.1:44103',SESSION_SERVICE_URL:'http://127.0.0.1:44104',TELEMETRY_SERVICE_URL:'http://127.0.0.1:44105'};
const base='http://127.0.0.1:44101',children=[],sockets=[];let logs='';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function request(route,token,method='GET',body,status=200,other={}){
 const headers={...(token?{Authorization:`Bearer ${token}`} :{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...other};
 const r=await fetch(base+route,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={text:text.slice(0,100)};}assert.equal(r.status,status,`${method} ${route}: ${JSON.stringify(data)}`);return data;
}
const login=(email,password)=>request('/api/auth/login',null,'POST',{email,password});
async function createUser(superToken,email,accessLevel,institutionId){
 const temp='synthetic-temporary-password-123',password='synthetic-permanent-password-456';
 const u=await request('/api/admin/users',superToken,'POST',{name:email,email,password:temp,accessLevel,institutionId,role:'FISIOTERAPIA'},201);
 const first=await login(email,temp);assert.equal(first.user.mustChangePassword,true);await request('/api/admin/users',first.token,'GET',undefined,403);
 await request('/api/auth/change-password',first.token,'POST',{currentPassword:temp,password});await request('/api/auth/me',first.token,'GET',undefined,401);
 return {...u,...await login(email,password),password};
}
async function connect(token){return new Promise((resolve,reject)=>{const s=io(base,{transports:['websocket'],auth:{token},reconnection:false});sockets.push(s);const t=setTimeout(()=>reject(new Error('Socket timeout')),6000);s.once('connect',()=>{clearTimeout(t);resolve(s);});s.once('connect_error',e=>{clearTimeout(t);reject(e);});});}
function migrationPreservesHistory(){
 const db=new Database(path.join(folder,'old-schema.db'));const migrations=path.join(root,'prisma/migrations');
 for(const name of fs.readdirSync(migrations).filter(n=>n!=='20261117000000_superadmin'&&fs.existsSync(path.join(migrations,n,'migration.sql'))).sort())db.exec(fs.readFileSync(path.join(migrations,name,'migration.sql'),'utf8'));
 db.prepare('INSERT INTO Specialist (id,email,password,name,role) VALUES (?,?,?,?,?)').run('legacy-specialist','legacy@example.test','synthetic-hash','Existing therapist','FISIOTERAPIA');
 db.prepare('INSERT INTO Patient (id,name,age,diagnosis,initialObservation) VALUES (?,?,?,?,?)').run('legacy-patient','Existing patient',8,'Synthetic diagnosis','Preserve notes');
 db.prepare('INSERT INTO ClinicalSession (id,patientId,patientName,durationSeconds,specialistRole,notes,specialistId) VALUES (?,?,?,?,?,?,?)').run('legacy-session','legacy-patient','Existing patient',10,'FISIOTERAPIA','Preserve session','legacy-specialist');
 db.exec(fs.readFileSync(path.join(migrations,'20261117000000_superadmin/migration.sql'),'utf8'));
 assert.equal(db.prepare('SELECT notes FROM ClinicalSession').get().notes,'Preserve session');assert.equal(db.prepare('SELECT institutionId FROM Patient').get().institutionId,'neurorobi-default');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM PatientAssignment').get().n,1);assert.deepEqual(db.pragma('foreign_key_check'),[]);db.close();
}
async function main(){
 migrationPreservesHistory();
 const vm=require('node:vm'),ts=require('typescript'),frontPath=path.resolve(root,'../../fronted_NeuroRobi-main/neurorobi_fronted/src/utils/interactions.ts'),front={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(frontPath,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:front,require});
 const measurements=Array.from({length:1000},(_,i)=>({elapsedMs:i*100+(i>500?3000:0),apreton:i%20>10,switchIzq:i%10>5,switchDer:i%15>10,mpu:true,movimiento:i%30>25?70:0}));
 assert.equal(JSON.stringify(front.analyze(measurements)),JSON.stringify(require('../dist/shared/interactions').analyze(measurements)));

 for(const script of ['migrate.cjs','bootstrap-admin.cjs','bootstrap-admin.cjs']){const r=spawnSync(process.execPath,[`scripts/${script}`],{cwd:root,env,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stdout+r.stderr);}
 const db=new Database(path.join(folder,'test.db'));assert.equal(db.prepare("SELECT COUNT(*) AS n FROM Specialist WHERE accessLevel='SUPERADMINISTRADOR'").get().n,1);db.close();
 for(const service of ['service-registry','auth-service','patient-service','session-service','telemetry-service','api-gateway']){const p=spawn(process.execPath,[`dist/services/${service}/index.js`],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(p);p.stdout.on('data',x=>{logs=(logs+x).slice(-20000);});p.stderr.on('data',x=>{logs=(logs+x).slice(-20000);});}
 let ready=false;for(let i=0;i<50;i++){try{await request('/health');ready=true;break;}catch{}await sleep(300);}assert.ok(ready,'Services not ready');
 await request('/api/admin/overview',null,'GET',undefined,401);
 let superUser=await login(env.SINGLE_USER_USERNAME,env.SINGLE_USER_PASSWORD);let st=superUser.token;assert.equal(superUser.user.accessLevel,'SUPERADMINISTRADOR');assert.equal(superUser.user.clinicalRead,true);
 const A='neurorobi-default',B=(await request('/api/admin/institutions',st,'POST',{name:'Synthetic institution B',contact:'QA only'},201)).id;
 const adminA=await createUser(st,'admin-a@example.test','ADMINISTRADOR',A),adminB=await createUser(st,'admin-b@example.test','ADMINISTRADOR',B),ta=await createUser(st,'therapist-a@example.test','TERAPEUTA',A),tb=await createUser(st,'therapist-b@example.test','TERAPEUTA',B);
 await request('/api/admin/users',adminA.token,'POST',{name:'Forbidden',email:'forbidden@example.test',password:'synthetic-password-123',accessLevel:'ADMINISTRADOR',institutionId:A},403);
 await request(`/api/admin/users/${superUser.user.id}`,adminA.token,'PATCH',{active:false},403);
 await request(`/api/admin/users?institutionId=${B}`,adminA.token,'GET',undefined,403);
 await request('/api/admin/users',st,'POST',{name:'Duplicate',email:'ADMIN-A@EXAMPLE.TEST',password:'synthetic-password-123',accessLevel:'ADMINISTRADOR',institutionId:A},409);
 const pA=await request('/api/patients',adminA.token,'POST',{name:'Synthetic private patient A',age:8,diagnosis:'Synthetic private diagnosis A'},201),pB=await request('/api/patients',adminB.token,'POST',{name:'Synthetic private patient B',age:9,diagnosis:'Synthetic private diagnosis B'},201);
 assert.equal((await request('/api/patients',st)).length,1);await request(`/api/patients/${pA.id}`,st);await request(`/api/patients/${pB.id}`,st,'GET',undefined,404);await request('/api/admin/assignments',st);
 await request(`/api/patients/${pB.id}`,adminA.token,'GET',undefined,404);assert.equal((await request('/api/patients',adminA.token)).length,1);
 await request(`/api/patients/${pA.id}`,ta.token,'GET',undefined,404);
 await request('/api/admin/assignments',adminA.token,'PUT',{patientId:pA.id,specialistId:ta.id,assigned:true});await request('/api/admin/assignments',adminB.token,'PUT',{patientId:pB.id,specialistId:tb.id,assigned:true});
 await request('/api/admin/assignments',adminA.token,'PUT',{patientId:pB.id,specialistId:tb.id,assigned:true},403);
 await request(`/api/patients/${pB.id}`,ta.token,'GET',undefined,404);assert.equal((await request(`/api/patients/${pA.id}`,ta.token)).id,pA.id);
 const assignments=await request('/api/admin/assignments?patientPage=1&therapistPage=1',adminA.token);assert.equal(assignments.patientTotal,1);assert.equal(assignments.therapistTotal,1);
 await request(`/api/patients/${pA.id}/status`,ta.token,'PUT',{status:'En Sesi'+String.fromCharCode(243)+'n'});
 await request(`/api/patients/${pA.id}`,ta.token,'DELETE',undefined,403);
 const dA=await request('/api/admin/devices',st,'POST',{id:'qa-oso-a',name:'QA Oso A',institutionId:A},201),dB=await request('/api/admin/devices',st,'POST',{id:'qa-oso-b',name:'QA Oso B',institutionId:B},201);
 const listed=await request('/api/admin/devices',st);assert.ok(!JSON.stringify(listed).includes(dA.deviceKey));assert.ok(!JSON.stringify(listed).includes('keyHash'));
 await request('/api/admin/devices',adminA.token,'POST',{id:'forbidden-oso',name:'Forbidden'},403);
 const heartbeat=(d,status=200,id=d.id)=>request('/api/telemetry',null,'POST',{heartbeat:true},status,{'x-device-key':d.deviceKey,'x-device-id':id});
 await request('/api/telemetry',null,'POST',{heartbeat:true},401,{'x-device-key':'wrong'});await heartbeat(dA);await heartbeat(dB);await heartbeat(dA,401,dB.id);
 const listA=await request('/api/telemetry/devices',ta.token);assert.ok(listA.some(d=>d.deviceId===dA.id));assert.ok(!listA.some(d=>d.deviceId===dB.id));
 const sa=await connect(ta.token),sb=await connect(tb.token),receivedA=[],receivedB=[];sa.on('sensor-data',x=>receivedA.push(x));sb.on('sensor-data',x=>receivedB.push(x));
 const control=(t,d,p,c,action='start',status=200)=>request('/api/telemetry/control',t,'POST',{deviceId:d.id,patientId:p.id,controllerId:c,action},status);
 await control(ta.token,dB,pA,'controller-cross', 'start',404);
 await control(ta.token,dA,pA,'controller-a');await control(tb.token,dB,pB,'controller-b');await control(adminA.token,dA,pA,'controller-other','start',409);
 await request('/api/telemetry',null,'POST',{},400,{'x-device-key':dA.deviceKey});
 sa.emit('start-stream',{patientId:pA.id,deviceId:dA.id});sb.emit('start-stream',{patientId:pB.id,deviceId:dB.id});await sleep(150);
 const packet=(d,value)=>request('/api/telemetry',null,'POST',{deviceType:'oso',flexIzq:value,apreton:true,switchIzq:true,switchDer:false,mpu:true,movimiento:70},200,{'x-device-key':d.deviceKey});await packet(dA,901);await packet(dB,902);await sleep(150);
 assert.equal(receivedA.length,1);assert.equal(receivedB.length,1);assert.equal(receivedA[0].deviceId,dA.id);assert.equal(receivedB[0].deviceId,dB.id);
 await request(`/api/admin/devices/${dA.id}`,st,'PATCH',{active:false},409);
 await control(ta.token,dA,pA,'controller-a','stop');await control(tb.token,dB,pB,'controller-b','stop');
 const superSocket=await connect(st),superReadings=[];superSocket.on('sensor-data',x=>superReadings.push(x));await control(st,dA,pA,'controller-super');superSocket.emit('start-stream',{patientId:pA.id,deviceId:dA.id});await sleep(150);await packet(dA,903);await sleep(150);assert.equal(superReadings.length,1);assert.equal(superReadings[0].deviceId,dA.id);await control(st,dA,pA,'controller-super','stop');

 const session=await request('/api/sessions',ta.token,'POST',{patientId:pA.id,specialistId:tb.id,deviceId:dA.id,durationSeconds:1,metrics:{},notes:'Synthetic clinical note',sensorHistory:[{elapsedMs:0,apreton:false,switchIzq:false,switchDer:false,mpu:true,movimiento:0},{elapsedMs:100,apreton:true,switchIzq:true,switchDer:false,mpu:true,movimiento:70},{elapsedMs:200,apreton:true,switchIzq:true,switchDer:false,mpu:true,movimiento:70},{elapsedMs:300,apreton:false,switchIzq:false,switchDer:false,mpu:true,movimiento:0}]},201);
 assert.equal(session.specialistId,ta.id);assert.equal(session.deviceId,dA.id);await request(`/api/sessions/${session.id}`,tb.token,'GET',undefined,404);await request(`/api/sessions/${session.id}/notes`,tb.token,'PATCH',{notes:'Forbidden'},404);
 await request('/api/sessions',ta.token,'POST',{patientId:pA.id,deviceId:dB.id,metrics:{}},403);
 const overview=await request('/api/admin/overview',st);assert.ok(overview.users.every(g=>typeof g._count==='number'));assert.equal(overview.interactions.squeezes,1);assert.equal(overview.interactions.pulses,1);assert.equal(overview.interactions.shakes,1);assert.ok(!JSON.stringify(overview).includes(pA.name));assert.ok(!JSON.stringify(overview).includes('Synthetic clinical note'));
 await request(`/api/admin/users/${superUser.user.id}`,st,'PATCH',{active:false},409);await request(`/api/admin/institutions/${A}`,st,'PATCH',{active:false},409);
 await request(`/api/admin/users/${superUser.user.id}`,st,'PATCH',{email:env.SINGLE_USER_USERNAME,clinicalRead:true});await request('/api/auth/me',st,'GET',undefined,401);superUser=await login(env.SINGLE_USER_USERNAME,env.SINGLE_USER_PASSWORD);st=superUser.token;
 await request(`/api/patients/${pA.id}`,st);await request(`/api/patients/${pB.id}`,st,'GET',undefined,404);
 const audited=await request('/api/admin/audit?q=CLINICAL_READ',st);assert.ok(audited.total>0);
 await heartbeat(dA);await control(ta.token,dA,pA,'controller-revoke');
 await request(`/api/admin/users/${ta.id}`,st,'PATCH',{active:false});await request('/api/patients',ta.token,'GET',undefined,401);await sleep(1300);assert.equal(sa.connected,false);assert.equal((await heartbeat(dA)).therapyActive,false);
 await request(`/api/admin/users/${ta.id}`,st,'PATCH',{active:true});await request('/api/auth/me',ta.token,'GET',undefined,401);
 await request(`/api/admin/users/${tb.id}/reset`,st,'POST',{password:'synthetic-reset-password-789'});await request('/api/auth/me',tb.token,'GET',undefined,401);
 const tempLogin=await login('therapist-b@example.test','synthetic-reset-password-789');assert.equal(tempLogin.user.mustChangePassword,true);await request('/api/patients',tempLogin.token,'GET',undefined,403);
 await request(`/api/admin/devices/${dA.id}`,st,'PATCH',{active:false});await heartbeat(dA,401);
 await request('/api/admin/settings',adminA.token,'GET',undefined,403);await request('/api/admin/settings',st,'PUT',{key:'sessionHours',value:'4'});assert.ok((await request('/api/admin/settings',st)).items.some(i=>i.key==='sessionHours'&&i.value==='4'));
 // Direct service calls must enforce identity, not trust the gateway or body role.
 const direct=await fetch('http://127.0.0.1:44103/api/patients');assert.equal(direct.status,401);
 const directDevice=await fetch('http://127.0.0.1:44105/api/telemetry',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(directDevice.status,401);
 const photo=new FormData();photo.set('name','QA super');photo.set('profileImage',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1cAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'qa.png');
 const up=await fetch(base+`/api/auth/profile/${superUser.user.id}`,{method:'PUT',headers:{Authorization:`Bearer ${st}`},body:photo});assert.equal(up.status,200);const profile=await up.json(),media='/api/media/'+profile.profileImageUrl.split('/').pop();assert.equal((await fetch(base+media)).status,401);assert.equal((await fetch(base+media,{headers:{Authorization:`Bearer ${st}`}})).status,200);assert.equal((await fetch(base+profile.profileImageUrl)).status,404);
 await request('/api/admin/settings',st,'PUT',{key:'multiUserEnabled',value:false});await request('/api/auth/me',st,'GET',undefined,401);await request('/api/auth/login',null,'POST',{email:'admin-a@example.test',password:adminA.password},401);superUser=await login(env.SINGLE_USER_USERNAME,env.SINGLE_USER_PASSWORD);st=superUser.token;await request('/api/admin/settings',st,'PUT',{key:'multiUserEnabled',value:true});superUser=await login(env.SINGLE_USER_USERNAME,env.SINGLE_USER_PASSWORD);st=superUser.token;
 await request('/api/auth/logout',st,'POST',{});await request('/api/auth/me',st,'GET',undefined,401);
 console.log('PASS: migration preserves records; bootstrap is idempotent; user lifecycle; temporary passwords; institution isolation; assignments; clinical privacy; last-superadmin protection; two-device streaming; exclusive therapies; revocation; audit; private images; direct-service authorization.');
 console.log('Temporary QA artifacts:',folder);
}
main().catch(e=>{console.error(e.message);console.error(logs);process.exitCode=1;}).finally(async()=>{for(const s of sockets)s.close();await Promise.all(children.map(p=>new Promise(resolve=>{if(p.exitCode!==null)return resolve();p.once('exit',resolve);if(!p.kill())resolve();})));});
