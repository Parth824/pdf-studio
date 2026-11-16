import { readFileSync } from 'node:fs';
const form = new FormData();
form.append('tool','inspect');
form.append('files',new Blob([readFileSync('test-output/sample.pdf')],{type:'application/pdf'}),'sample.pdf');
form.append('options','{}');
const r = await fetch('http://127.0.0.1:3000/api/process',{method:'POST',body:form,headers:{Origin:'http://127.0.0.1:3000'}});
const data = await r.json();
console.log(JSON.stringify({status:r.status,ok:data.ok,error:data.error,pages:data.pages,thumbnails:data.thumbnails?.length}));
