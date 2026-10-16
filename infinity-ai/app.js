import { CreateMLCEngine } from "https://esm.sh/@mlc-ai/web-llm";
const $ = id => document.getElementById(id);
let key = sessionStorage.getItem("infinityKey") || "";
let chats = [];
try { chats = JSON.parse(localStorage.getItem("infinityChats") || "[]"); } catch {}
if (!Array.isArray(chats)) chats = [];
let current = chats[0]?.id || null;
let engine = null, loading = false, busy = false, aborter = null;
const LOCAL_MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
function persist(){ try { localStorage.setItem("infinityChats", JSON.stringify(chats)); } catch {} }
function active(){ return chats.find(c => c.id === current); }
function setStatus(s){ $("status").textContent = " · " + s; }
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function render(){
 const c=active(), box=$("messages");
 $("welcome").hidden=!!(c&&c.messages.length); box.hidden=!c||!c.messages.length; box.replaceChildren();
 if(c) c.messages.forEach(m=>{
  const el=document.createElement("div"); el.className="message "+m.role;
  const av=document.createElement("div"); av.className="avatar"; av.textContent=m.role==="user"?"Y":"∞";
  const body=document.createElement("div"), who=document.createElement("div"), txt=document.createElement("div");
  who.className="who"; who.textContent=m.role==="user"?"You":"Infinity AI · "+(m.model||"Local AI");
  txt.className="text"; txt.innerHTML=esc(m.content||"").replace(/\n/g,"<br>");
  body.append(who,txt);
  if(m.role==="assistant"){const cp=document.createElement("button");cp.className="btn";cp.textContent="Copy";cp.style.marginTop="8px";cp.onclick=()=>navigator.clipboard?.writeText(m.content||"");body.append(cp);}
  el.append(av,body);box.append(el);
 });
 $("history").replaceChildren();
 chats.forEach(c=>{const el=document.createElement("div");el.className="chat"+(c.id===current?" active":"");el.textContent=c.title||"New conversation";el.onclick=()=>{current=c.id;render();$("sidebar").classList.remove("open");};$("history").append(el);});
 $("scroll").scrollTop=$("scroll").scrollHeight;
}
async function loadLocal(){
 if(engine||loading)return engine;
 if(!("gpu" in navigator)){setStatus("WebGPU unavailable");$("notice").textContent="This browser/device does not expose WebGPU. Try updating Chrome or Edge and enabling hardware acceleration, or use a compatible computer. Local model inference needs supported hardware.";throw Error("WebGPU is not available in this browser/device.");}
 loading=true;$("load").disabled=true;$("load").textContent="Loading…";setStatus("Downloading local model…");
 try{
  const mod=await import("https://esm.sh/@mlc-ai/web-llm");
  engine=await mod.CreateMLCEngine(LOCAL_MODEL,{initProgressCallback:p=>{const msg=p?.text||"Loading model…";setStatus(msg.slice(0,70));$("load").textContent=(p?.progress!=null?Math.round(p.progress*100)+"%":"Loading…");}});
  setStatus("Local model ready");$("notice").textContent="Local model is ready. Prompts run on your device without an API key. Responses may be slower on lower-memory computers.";
  $("load").textContent="✓ Local model ready";return engine;
 }catch(e){engine=null;setStatus("Local model unavailable");throw e;}
 finally{loading=false;$("load").disabled=false;if(!engine)$("load").textContent="↓ Retry local model";}
}
function settings(){ $("key").value=key;$("modal").classList.add("open"); }
$("settings").onclick=settings;$("settingsTop")?.addEventListener("click",settings);
$("close").onclick=()=>$("modal").classList.remove("open");
$("save").onclick=()=>{key=$("key").value.trim();sessionStorage.setItem("infinityKey",key);$("modal").classList.remove("open");setStatus(key?"Cloud key set":"Keyless local mode");};
$("new").onclick=()=>{const c={id:Date.now().toString(36),title:"New conversation",messages:[]};chats.unshift(c);current=c.id;persist();render();$("prompt").focus();};
$("menu").onclick=()=>$("sidebar").classList.toggle("open");
$("export").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(chats,null,2)],{type:"application/json"}));a.download="infinity-ai-chats.json";a.click();URL.revokeObjectURL(a.href);};
$("clear").onclick=()=>{if(confirm("Delete all saved chats?")){chats=[];current=null;persist();render();}};
document.querySelectorAll("[data-text]").forEach(b=>b.onclick=()=>{$("prompt").value=b.dataset.text;$("prompt").focus();});
$("improve").onclick=()=>{const p=$("prompt");if(p.value.trim())p.value="Rewrite this as a clear, specific request while preserving my intent:\n\n"+p.value;};
$("load").onclick=()=>loadLocal().catch(e=>{setStatus("Could not load model");alert("Could not load local AI: "+e.message+"\n\nTry Chrome or Edge with WebGPU and enough free memory.");});
async function send(){
 if(busy){aborter?.abort();return}
 const text=$("prompt").value.trim();if(!text)return;
 const model=$("model").value;
 if(model!=="local"&&!key){settings();return;}
 if(!current){const c={id:Date.now().toString(36),title:text.slice(0,45),messages:[]};chats.unshift(c);current=c.id;}
 const c=active();if(c.title==="New conversation")c.title=text.slice(0,45);
 c.messages.push({role:"user",content:text});$("prompt").value="";
 const answer={role:"assistant",content:"",model:model==="local"?"Local AI":model.split("/").pop()};c.messages.push(answer);persist();render();
 busy=true;$("send").textContent="Stop ■";aborter=new AbortController();
 try{
  const history=[{role:"system",content:"You are Infinity AI Ultra, a helpful and practical assistant. Explain clearly, acknowledge uncertainty, and provide runnable code when useful."},...c.messages.slice(0,-1).map(m=>({role:m.role,content:m.content}))];
  let response="";
  if(model==="local"){
   const eng=await loadLocal();
   const result=await eng.chat.completions.create({messages:history,temperature:0.7,max_tokens:900});
   response=result.choices?.[0]?.message?.content||"The local model returned an empty response.";
  }else{
   const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+key,"X-Title":"Infinity AI Ultra"},body:JSON.stringify({model,messages:history,stream:false}),signal:aborter.signal});
   const d=await r.json();if(!r.ok)throw Error(d.error?.message||"Request failed ("+r.status+")");
   response=d.choices?.[0]?.message?.content||"The model returned an empty response.";
  }
  answer.content=response;
 }catch(e){answer.content=e.name==="AbortError"?"Generation stopped.":"AI error: "+e.message+"\n\nFor keyless mode, load the local model first and ensure WebGPU is supported. Cloud GPT/Claude requires a valid OpenRouter key.";}
 finally{busy=false;aborter=null;$("send").textContent="Send ↗";persist();render();}
}
$("send").onclick=send;
$("prompt").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}});
$("prompt").addEventListener("input",e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,150)+"px";});
$("model").onchange=()=>{if($("model").value==="local"){setStatus("No API key needed");}else setStatus("Cloud model needs API key");};
render();setStatus("No API key needed");
