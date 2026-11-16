const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');let checked=0;
function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.git'].includes(f.name))continue;const file=path.join(dir,f.name);if(f.isDirectory())walk(file);else if(/\.(?:cjs|mjs|js)$/.test(file)){execFileSync(process.execPath,['--check',file],{stdio:'inherit'});checked++;}}}
walk(root);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const [,src]of html.matchAll(/<script src="([^"]+)"/g))if(!fs.existsSync(path.join(root,src)))throw Error('Missing script '+src);
for(const [,href]of html.matchAll(/<link[^>]+href="([^"]+)"/g))if(!/^(?:https?:|data:)/.test(href)&&!fs.existsSync(path.join(root,href)))throw Error('Missing stylesheet '+href);
let inline=0;for(const [,script]of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(!script.trim())continue;new (require('node:vm').Script)(script,{filename:'index.html inline '+(++inline)});}
console.log('Checked '+checked+' JavaScript files, '+inline+' inline scripts, and local asset references.');
