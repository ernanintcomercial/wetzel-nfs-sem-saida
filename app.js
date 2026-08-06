const money = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0});
const integer = new Intl.NumberFormat("pt-BR");
const formatDate = value => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
const bands = [
  ["0\u20132 dias",0,2,"#2f8f83"],["3\u20137 dias",3,7,"#58a89c"],["8\u201315 dias",8,15,"#d6a34a"],
  ["16\u201330 dias",16,30,"#dd7a48"],["31\u201360 dias",31,60,"#cf5058"],["61+ dias",61,Infinity,"#8f2735"]
];
const colors = {"Sem situa\u00e7\u00e3o":"#8994a5","Aguardo Expedi\u00e7\u00e3o":"#d6a34a","N\u00e3o Liberados":"#cf5058","Liberados":"#2f8f83","Em Confer\u00eancia":"#6b79c8","Embarque Expedido":"#4f8fba","Em Separa\u00e7\u00e3o":"#a56cc1"};
let records=[], filtered=[], visible=15, selectedStatus="Todos", selectedRegion="Todas", selectedPriority="Todas", minimumAge=0, selectedBand=null, sorting="age", metricMode="value";
let activeObservationKey=null;
let observationsCache=readLocalObservations(), observationsRemote=false;
const byId = id => document.getElementById(id);
const sum = (items,field="value") => items.reduce((total,item)=>total+(Number(item[field])||0),0);
const escapeHtml = value => String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const observationKey = record => `${record.nf}|${record.clientId}|${record.emission}`;
function readLocalObservations(){try{return JSON.parse(localStorage.getItem("wetzel-nf-observations")||"{}")}catch{return{}}}
function writeLocalObservations(data){try{localStorage.setItem("wetzel-nf-observations",JSON.stringify(data))}catch{}}
function getObservation(record){return observationsCache[observationKey(record)]||{status:"Sem status",text:"",updatedAt:""}}
function observationTimestamp(value){if(!value)return"";const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}
async function loadRemoteObservations(){
  try{
    const response=await fetch("/api/nfs/observacoes",{headers:{Accept:"application/json"}});
    if(!response.ok)return;
    observationsCache=await response.json();observationsRemote=true;
  }catch{}
}
async function saveObservation(record,status,text){
  if(observationsRemote){
    const response=await fetch("/api/nfs/observacoes",{method:"PUT",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({recordKey:observationKey(record),status,text})});
    if(!response.ok)throw new Error(await response.text()||"Não foi possível salvar a observação.");
    const saved=await response.json();observationsCache[observationKey(record)]=saved;return;
  }
  observationsCache[observationKey(record)]={status,text,updatedAt:new Date().toISOString()};
  writeLocalObservations(observationsCache);
}
function observationPreview(observation){return observation.text||"Adicionar observação"}
function closeObservation(){byId("observationPopover").classList.remove("open","editing");activeObservationKey=null}
function openObservation(record,button){
  const observation=getObservation(record),popover=byId("observationPopover"),rect=button.getBoundingClientRect();
  activeObservationKey=observationKey(record);
  byId("observationTitle").textContent=`NF ${record.nf}`;
  byId("observationContext").textContent=`${record.client} · ${money.format(record.value)}`;
  byId("observationViewStatus").textContent=observation.status;
  byId("observationViewText").textContent=observation.text||"Sem detalhamento.";
  byId("observationUpdated").textContent=observation.updatedAt?`Última atualização: ${observationTimestamp(observation.updatedAt)}`:"Ainda sem atualização";
  byId("observationStatus").value=observation.status;
  byId("observationText").value=observation.text;
  popover.classList.remove("editing");popover.classList.add("open");
  const width=Math.min(390,window.innerWidth-24),left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12));
  popover.style.width=`${width}px`;
  const height=Math.min(popover.offsetHeight,window.innerHeight-24),below=rect.bottom+8;
  const top=below+height<=window.innerHeight-12?below:Math.max(12,rect.top-height-8);
  popover.style.left=`${left+window.scrollX}px`;popover.style.top=`${top+window.scrollY}px`;
}
function setTheme(theme){
  const selected=theme==="light"?"light":"dark";
  document.documentElement.dataset.theme=selected;
  try{localStorage.setItem("wetzel-theme",selected)}catch{}
  document.querySelectorAll("[data-theme-option]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.themeOption===selected)));
}
document.querySelectorAll("[data-theme-option]").forEach(button=>button.onclick=()=>setTheme(button.dataset.themeOption));
setTheme(document.documentElement.dataset.theme);
function risk(age){
  if(age>=31)return["Cr\u00edtico","critical"]; if(age>=16)return["Alerta","warning"];
  if(age>=8)return["Aten\u00e7\u00e3o","attention"]; return["Recente","recent"];
}
function renderTable(){
  const q=byId("search").value.trim().toLocaleLowerCase("pt-BR");
  filtered=records.filter(x=>(selectedStatus==="Todos"||x.octopus===selectedStatus)&&(selectedRegion==="Todas"||x.region===selectedRegion)&&(selectedPriority==="Todas"||(selectedPriority==="Priorit\u00e1rias"?x.priority:!x.priority))&&x.age>=minimumAge&&(!selectedBand||(x.age>=selectedBand.min&&x.age<=selectedBand.max)))
    .filter(x=>!q||[x.nf,x.client,x.representative,x.shipment].join(" ").toLocaleLowerCase("pt-BR").includes(q))
    .sort((a,b)=>sorting==="value"?b.value-a.value:b.age-a.age||b.value-a.value);
  byId("resultCount").textContent=`${integer.format(filtered.length)} resultados`;
  byId("tableBody").innerHTML=filtered.slice(0,visible).map(x=>{
    const [label,klass]=risk(x.age);
    const observation=getObservation(x);
    return `<tr><td><span class="risk ${klass}">${label}</span></td><td><strong class="nf">${escapeHtml(x.nf)}</strong><small>${formatDate(x.emission)}</small></td><td><strong>${escapeHtml(x.client)}</strong><small>${escapeHtml(x.group)} \u00b7 Emb. ${escapeHtml(x.shipment)}</small><span class="priority-flag${x.priority?"":" standard"}">${x.priority?"Priorit\u00e1rio":"N\u00e3o priorit\u00e1rio"}</span></td><td>${escapeHtml(x.representative)}<small>${escapeHtml(x.region)}</small></td><td><span class="status-pill"><i style="background:${colors[x.octopus]||"#8994a5"}"></i>${escapeHtml(x.octopus)}</span></td><td class="number">${money.format(x.value)}</td><td class="age-cell"><strong>${x.age}</strong><span>dias</span></td><td><button type="button" class="observation-cell${observation.text?" has-observation":""}" data-observation-key="${escapeHtml(observationKey(x))}"><strong>${escapeHtml(observation.status)}</strong><span>${escapeHtml(observationPreview(observation))}</span></button></td></tr>`;
  }).join("");
  byId("loadMore").hidden=visible>=filtered.length;
  byId("emptyState").hidden=filtered.length>0;
}
function applyStatus(label){
  selectedStatus=selectedStatus===label?"Todos":label;
  byId("statusFilter").value=selectedStatus; visible=15;
  document.querySelectorAll("#statusList button").forEach(b=>b.classList.toggle("active",b.dataset.status===selectedStatus));
  renderTable();
}
const evolutionPoints=[["D-1",1],["7 dias",7],["30 dias",30]];
const isoShift=(date,days)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
const dayDistance=(a,b)=>Math.round((new Date(`${a}T00:00:00Z`)-new Date(`${b}T00:00:00Z`))/86400000);
function nearestSnapshot(history,target,currentDate){
  return history.filter(x=>x.date!==currentDate).map(x=>({item:x,distance:Math.abs(dayDistance(x.date,target))})).filter(x=>x.distance<=2).sort((a,b)=>a.distance-b.distance)[0]?.item||null;
}
function comparisonCell(current,previous,formatter){
  if(previous===null||previous===undefined)return`<span class="no-data">sem dado</span>`;
  const delta=current-previous,klass=delta>0?"worse":delta<0?"better":"same",sign=delta>0?"+":"";
  return`${formatter(previous)} <span class="evo-delta ${klass}">(${sign}${formatter(delta)})</span>`;
}
function evolutionRow(label,current,history,currentDate,getter,formatter){
  const comparisons=evolutionPoints.map(([,days])=>{const snapshot=nearestSnapshot(history,isoShift(currentDate,-days),currentDate);return`<td>${comparisonCell(current,snapshot?getter(snapshot):null,formatter)}</td>`}).join("");
  return`<tr><td>${label}</td><td>${formatter(current)}</td>${comparisons}</tr>`;
}
function evolutionHeader(){return`<thead><tr><th>M\u00e9trica</th><th>Hoje</th>${evolutionPoints.map(x=>`<th>${x[0]}</th>`).join("")}</tr></thead>`}
async function init(){
  const data=await fetch("nfs-compact.json?v=20260805").then(r=>r.json());
  const reference=new Date(`${data.referenceDate}T12:00:00`);
  records=data.records.map(x=>{const emission=new Date(reference);emission.setDate(emission.getDate()-x[1]);return{nf:x[0],age:x[1],emission:emission.toISOString().slice(0,10),clientId:x[2],client:data.clients[x[3]],representative:data.representatives[x[4]],value:x[5],shipment:x[6],octopus:data.statuses[x[7]],group:data.groups[x[8]],region:data.regions[x[9]],priority:Boolean(x[10])}});
  await loadRemoteObservations();
  byId("updatedAt").innerHTML=`Atualizado em: <b>${data.sourceUpdatedAt}</b><br>Refer\u00eancia da base: ${formatDate(data.referenceDate)}`;
  byId("referenceDate").textContent=`Refer\u00eancia: ${formatDate(data.referenceDate)} \u00b7 Sa\u00edda vazia na origem`;
  const total=sum(records), critical=records.filter(x=>x.age>=25), old=records.filter(x=>x.age>=16), priority=records.filter(x=>x.priority);
  const priorityClients=new Set(priority.map(x=>x.clientId)).size;
  byId("kpis").innerHTML=[
    ["primary","VALOR SEM SA\u00cdDA","R$",money.format(total),"3,7% do faturamento da base"],
    ["","NOTAS SEM SA\u00cdDA","#",integer.format(records.length),`em ${new Set(records.map(x=>x.clientId)).size} clientes`],
    ["","CLIENTES PRIORIT\u00c1RIOS AFETADOS","!",integer.format(priorityClients),`${integer.format(priority.length)} NFs priorit\u00e1rias`],
    ["critical-card","MAIOR TEMPO","\u2197",`${Math.max(...records.map(x=>x.age))} dias`,"desde emiss\u00e3o da NF"]
  ].map(x=>`<article class="kpi-card ${x[0]}"><div class="kpi-label"><span>${x[1]}</span><i>${x[2]}</i></div><strong>${x[3]}</strong><p>${x[4]}</p></article>`).join("");
  const regionRows=data.regions.map(region=>{const items=records.filter(x=>x.region===region);return{label:region,value:sum(items),count:items.length,maxAge:Math.max(...items.map(x=>x.age))}});
  byId("regionSummaryBody").innerHTML=regionRows.map(x=>`<tr><td>${escapeHtml(x.label)}</td><td>${money.format(x.value)}</td><td>${integer.format(x.count)}</td><td>${integer.format(x.maxAge)}</td></tr>`).join("");
  const currentSnapshot={date:data.referenceDate,kpis:{value:total,count:records.length,priorityClients,maxAge:Math.max(...records.map(x=>x.age))},regions:regionRows};
  let history=[];try{history=await fetch("historico-nfs.json?v=20260805").then(r=>r.ok?r.json():[])}catch{}
  const generalRows=[
    evolutionRow("NF sem sa\u00edda (R$)",currentSnapshot.kpis.value,history,data.referenceDate,x=>x.kpis.value,money.format),
    evolutionRow("Quantidade de NFs",currentSnapshot.kpis.count,history,data.referenceDate,x=>x.kpis.count,integer.format),
    evolutionRow("Clientes priorit\u00e1rios afetados",currentSnapshot.kpis.priorityClients,history,data.referenceDate,x=>x.kpis.priorityClients,integer.format),
    evolutionRow("Maior tempo sem sa\u00edda (dias)",currentSnapshot.kpis.maxAge,history,data.referenceDate,x=>x.kpis.maxAge,integer.format)
  ].join("");
  byId("evoPanelGeral").innerHTML=`<table>${evolutionHeader()}<tbody>${generalRows}</tbody></table><div class="evo-help">Varia\u00e7\u00e3o entre par\u00eanteses compara Hoje com cada snapshot. Aumento aparece em vermelho; redu\u00e7\u00e3o, em verde.</div>`;
  byId("evoPanelRegiao").innerHTML=`<table>${evolutionHeader()}<tbody>${regionRows.map(region=>{
    const rowHistory=history.map(snapshot=>({...snapshot,region:(snapshot.regions||[]).find(x=>x.label===region.label)}));
    return`<tr class="region-title"><td colspan="5">${escapeHtml(region.label)}</td></tr>`+
      evolutionRow("NF sem sa\u00edda (R$)",region.value,rowHistory,data.referenceDate,x=>x.region?.value,money.format)+
      evolutionRow("Quantidade de NFs",region.count,rowHistory,data.referenceDate,x=>x.region?.count,integer.format)+
      evolutionRow("Maior tempo (dias)",region.maxAge,rowHistory,data.referenceDate,x=>x.region?.maxAge,integer.format);
  }).join("")}</tbody></table>`;
  ["Geral","Regiao"].forEach(name=>byId(`evoToggle${name}`).onclick=()=>{byId(`evoToggle${name}`).classList.toggle("open");byId(`evoPanel${name}`).classList.toggle("open")});
  const bandData=bands.map(([label,min,max,color])=>{const items=records.filter(x=>x.age>=min&&x.age<=max);return{label,min,color,count:items.length,value:sum(items)}});
  byId("ageNote").insertAdjacentText("beforeend",` Faixas acima de 15 dias concentram ${money.format(sum(old))}.`);
  function drawAgeChart(){
    const maxBand=Math.max(...bandData.map(x=>x[metricMode]));
    byId("ageChart").innerHTML=bandData.map(x=>`<button class="age-column${selectedBand&&selectedBand.min===x.min?" selected":""}" data-age="${x.min}" aria-label="Filtrar ${x.label}"><strong>${metricMode==="count"?integer.format(x.count):money.format(x.value)}</strong><div class="bar-track"><span style="height:${Math.max(7,x[metricMode]/maxBand*100)}%;background:${x.color}"></span></div><small>${x.label}</small><em>${metricMode==="count"?money.format(x.value):`${integer.format(x.count)} NFs`}</em></button>`).join("");
    document.querySelectorAll(".age-column").forEach((button,index)=>button.onclick=()=>{
      const band=bandData[index], same=selectedBand&&selectedBand.min===band.min;
      selectedBand=same?null:{min:band.min,max:bands[index][2],label:band.label,count:band.count};
      minimumAge=0; byId("ageFilter").value="0"; visible=15;
      byId("ageNote").innerHTML=selectedBand?`<span></span> Filtro ativo: ${selectedBand.label} \u00b7 ${selectedBand.count} NFs. Clique novamente para limpar.`:`<span></span> Faixas acima de 15 dias concentram ${money.format(sum(old))}.`;
      drawAgeChart(); renderTable();
      document.querySelector(".table-panel").scrollIntoView({behavior:"smooth",block:"start"});
    });
  }
  byId("metricQuantity").onclick=()=>{metricMode="count";byId("metricQuantity").classList.add("active");byId("metricValue").classList.remove("active");drawAgeChart()};
  byId("metricValue").onclick=()=>{metricMode="value";byId("metricValue").classList.add("active");byId("metricQuantity").classList.remove("active");drawAgeChart()};
  drawAgeChart();
  const statuses=[...new Set(records.map(x=>x.octopus))].map(label=>{const items=records.filter(x=>x.octopus===label);return{label,count:items.length,value:sum(items)}}).sort((a,b)=>b.count-a.count);
  let cursor=0; const segments=statuses.map(x=>{const start=cursor;cursor+=x.count/records.length*100;return`${colors[x.label]||"#8994a5"} ${start}% ${cursor}%`});
  byId("donut").style.background=`conic-gradient(${segments.join(",")})`; byId("donutTotal").textContent=records.length;
  byId("statusList").innerHTML=statuses.map(x=>`<button data-status="${escapeHtml(x.label)}"><span class="legend-dot" style="background:${colors[x.label]}"></span><span>${escapeHtml(x.label)}</span><strong>${x.count}</strong><small>${money.format(x.value)}</small></button>`).join("");
  document.querySelectorAll("#statusList button").forEach(b=>b.onclick=()=>applyStatus(b.dataset.status));
  byId("statusFilter").innerHTML+=statuses.map(x=>`<option>${escapeHtml(x.label)}</option>`).join("");
  const clients=[...priority.reduce((map,x)=>{const v=map.get(x.group)||{label:x.group,count:0,value:0};v.count++;v.value+=x.value;map.set(x.group,v);return map},new Map()).values()].sort((a,b)=>b.value-a.value).slice(0,5);
  const maxClient=Math.max(...clients.map(x=>x.value));
  byId("clientList").innerHTML=clients.map((x,i)=>`<div class="client-row"><span class="rank">0${i+1}</span><div class="client-name"><strong>${escapeHtml(x.label)}</strong><small>${x.count} notas fiscais</small></div><div class="client-bar"><span style="width:${x.value/maxClient*100}%"></span></div><strong class="client-value">${money.format(x.value)}</strong></div>`).join("");
  byId("search").oninput=()=>{visible=15;renderTable()};
  byId("statusFilter").onchange=e=>{selectedStatus=e.target.value;visible=15;renderTable()};
  byId("priorityFilter").onchange=e=>{selectedPriority=e.target.value;visible=15;renderTable()};
  byId("ageFilter").onchange=e=>{minimumAge=Number(e.target.value);selectedBand=null;drawAgeChart();visible=15;renderTable()};
  byId("regionFilter").innerHTML+=data.regions.map(x=>`<option>${escapeHtml(x)}</option>`).join("");
  byId("regionFilter").onchange=e=>{selectedRegion=e.target.value;visible=15;renderTable()};
  byId("sortFilter").onchange=e=>{sorting=e.target.value;visible=15;renderTable()};
  byId("loadMore").onclick=()=>{visible+=20;renderTable()};
  byId("tableBody").onclick=event=>{
    const button=event.target.closest(".observation-cell");if(!button)return;
    const record=records.find(item=>observationKey(item)===button.dataset.observationKey);if(record)openObservation(record,button);
  };
  byId("observationClose").onclick=closeObservation;
  byId("observationCancel").onclick=()=>byId("observationPopover").classList.remove("editing");
  byId("observationEdit").onclick=()=>byId("observationPopover").classList.add("editing");
  byId("observationSave").onclick=async()=>{
    const record=records.find(item=>observationKey(item)===activeObservationKey);if(!record)return;
    const button=byId("observationSave");button.disabled=true;
    try{
      await saveObservation(record,byId("observationStatus").value,byId("observationText").value.trim());
      closeObservation();renderTable();
    }catch(error){alert(error.message)}finally{button.disabled=false}
  };
  document.addEventListener("keydown",event=>{if(event.key==="Escape")closeObservation()});
  renderTable();
}
init().catch(()=>{byId("updatedAt").textContent="N\u00e3o foi poss\u00edvel carregar a base.";});

