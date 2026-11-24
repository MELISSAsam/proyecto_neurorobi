require('dotenv').config();
const bcrypt=require('bcryptjs'),{createHash}=require('crypto');
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');
async function main(){
 if(!/^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL||''))throw new Error('Configura DATABASE_URL con una URL PostgreSQL valida');
 const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
 const institutionId='neurorobi-default';
 const log=(action,resource)=>prisma.auditLog.create({data:{actorName:'Configuracion de arranque',institutionId,action,resource,result:'SUCCESS'}});
 try{
 await prisma.institution.upsert({where:{id:institutionId},create:{id:institutionId,name:'NeuroRobi - Institucion inicial'},update:{}});
 const single=process.env.SINGLE_USER_USERNAME?.trim().toLowerCase();
 if(single){
  const existing=await prisma.specialist.findUnique({where:{email:single}}),password=process.env.SINGLE_USER_PASSWORD;
  if(!existing){if(!password||password.length<8)throw new Error('Configura SINGLE_USER_PASSWORD');await prisma.specialist.create({data:{email:single,password:await bcrypt.hash(password,12),name:'Administrador',role:'ADMIN',accessLevel:'ADMINISTRADOR',institutionId}});}

 }
 const initial=process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
 if(initial&&!await prisma.specialist.findUnique({where:{email:initial}})){
  const password=process.env.INITIAL_ADMIN_PASSWORD;if(!initial.includes('@')||!password||password.length<12)throw new Error('Credenciales iniciales invalidas');
  await prisma.specialist.create({data:{email:initial,password:await bcrypt.hash(password,12),name:'Administrador',role:'ADMIN',accessLevel:'ADMINISTRADOR',institutionId}});
 }
 const superEmail=process.env.SUPERADMIN_EMAIL?.trim().toLowerCase()||single;
 if(superEmail&&!await prisma.platformSetting.findUnique({where:{key:'superadminBootstrapped'}})){
  if(single&&process.env.MULTI_USER_ENABLED!=='true'&&superEmail!==single)throw new Error('Activa MULTI_USER_ENABLED para habilitar varias cuentas');
  const existing=await prisma.specialist.findUnique({where:{email:superEmail}});
  if(existing){await prisma.specialist.update({where:{id:existing.id},data:{accessLevel:'SUPERADMINISTRADOR',role:'ADMIN',active:true,clinicalRead:false,sessionVersion:{increment:1}}});}
  else{const password=process.env.SUPERADMIN_PASSWORD;if(!superEmail.includes('@')||!password||password.length<12)throw new Error('Configura SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD (minimo 12 caracteres)');await prisma.specialist.create({data:{email:superEmail,password:await bcrypt.hash(password,12),name:'Superadministrador',role:'ADMIN',accessLevel:'SUPERADMINISTRADOR',institutionId}});}
  await prisma.platformSetting.create({data:{key:'superadminBootstrapped',value:'true'}});await log('SUPERADMIN_BOOTSTRAP',superEmail);
 }
 if(process.env.TELEMETRY_API_KEY){
  const id=process.env.LEGACY_DEVICE_ID||'oso-principal';
  await prisma.neuroDevice.upsert({where:{id},create:{id,name:'Oso NeuroRobi principal',institutionId,keyHash:createHash('sha256').update(process.env.TELEMETRY_API_KEY).digest('hex')},update:{}});
 }
 if(!await prisma.platformSetting.findUnique({where:{key:'interactionCountsBackfilled'}})){
  const {analyze}=require('../dist/shared/interactions.js');
  let cursor;
  for(;;){const batch=await prisma.clinicalSession.findMany({take:100,orderBy:{id:'asc'},...(cursor?{cursor:{id:cursor},skip:1}:{}),include:{sensorHistory:{orderBy:{id:'asc'}}}});if(!batch.length)break;
   for(const s of batch){const readings=s.sensorHistory.map(r=>{try{return {...r,...JSON.parse(r.payload||'{}')};}catch{return r;}});const c=analyze(readings);await prisma.clinicalSession.update({where:{id:s.id},data:{pulses:c.contacts||0,squeezes:c.squeezes||0,shakes:c.shakes||0}});}cursor=batch[batch.length-1].id;
  }
  await prisma.platformSetting.create({data:{key:'interactionCountsBackfilled',value:'true'}});
 }
 console.log('Configuracion administrativa preparada; se conservaron usuarios, credenciales e historial.');
 }finally{await prisma.$disconnect();}
}
main().catch(e=>{console.error('Error de configuracion:',e.message);process.exitCode=1;});
