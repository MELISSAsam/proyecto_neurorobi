const {spawn}=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const env={...process.env,VITE_API_URL:'http://127.0.0.1:44999',VITE_WS_URL:'http://127.0.0.1:44999'};
const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5175','--strictPort'],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let logs='';server.stdout.on('data',v=>logs+=v);server.stderr.on('data',v=>logs+=v);
(async()=>{try{
 let ready=false;for(let n=0;n<40;n++){if(server.exitCode!==null)throw new Error(logs);try{const r=await fetch('http://127.0.0.1:5175');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw new Error('Preview unavailable: '+logs);
 for(const file of ['test-admin-browser.cjs','test-reports-browser.cjs','test-therapy-browser.cjs'])await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(__dirname,file)],{cwd:root,env,windowsHide:true,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(file+' failed')));});
 }finally{server.kill();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
