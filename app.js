const money = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0});
const integer = new Intl.NumberFormat("pt-BR");
const formatDate = value => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
const bands = [
  ["0\u20132 dias",0,2,"#2f8f83"],["3\u20137 dias",3,7,"#58a89c"],["8\u201315 dias",8,15,"#d6a34a"],
  ["16\u201330 dias",16,30,"#dd7a48"],["31\u201360 dias",31,60,"#cf5058"],["61+ dias",61,Infinity,"#8f2735"]
];
const colors = {"Sem situa\u00e7\u00e3o":"#8994a5","Aguardo Expedi\u00e7\u00e3o":"#d6a34a","N\u00e3o Liberados":"#cf5058","Liberados":"#2f8f83","Em Confer\u00eancia":"#6b79c8"};
let records=[], filtered=[], visible=15, selectedStatus="Todos", selectedRegion="Todas", selectedPriority="Todas", minimumAge=0, selectedBand=null, sorting="age", metricMode="count";
const byId = id => document.getElementById(id);
const sum = (items,field="value") => items.reduce((total,item)=>total+(Number(item[field])||0),0);
const escapeHtml = value => String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
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
    return `<tr><td><span class="risk ${klass}">${label}</span></td><td><strong class="nf">${escapeHtml(x.nf)}</strong><small>${formatDate(x.emission)}</small></td><td><strong>${escapeHtml(x.client)}</strong><small>${escapeHtml(x.group)} \u00b7 Emb. ${escapeHtml(x.shipment)}</small><span class="priority-flag${x.priority?"":" standard"}">${x.priority?"Priorit\u00e1rio":"N\u00e3o priorit\u00e1rio"}</span></td><td>${escapeHtml(x.representative)}<small>${escapeHtml(x.region)}</small></td><td><span class="status-pill"><i style="background:${colors[x.octopus]||"#8994a5"}"></i>${escapeHtml(x.octopus)}</span></td><td class="number">${money.format(x.value)}</td><td class="age-cell"><strong>${x.age}</strong><span>dias</span></td></tr>`;
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
async function init(){
  const data=await fetch("nfs-compact.json?v=6").then(r=>r.json());
  const reference=new Date(`${data.referenceDate}T12:00:00`);
  records=data.records.map(x=>{const emission=new Date(reference);emission.setDate(emission.getDate()-x[1]);return{nf:x[0],age:x[1],emission:emission.toISOString().slice(0,10),clientId:x[2],client:data.clients[x[3]],representative:data.representatives[x[4]],value:x[5],shipment:x[6],octopus:data.statuses[x[7]],group:data.groups[x[8]],region:data.regions[x[9]],priority:Boolean(x[10])}});
  byId("updatedAt").textContent=`Base atualizada em ${data.sourceUpdatedAt}`;
  byId("referenceDate").textContent=`Refer\u00eancia: ${formatDate(data.referenceDate)} \u00b7 Sa\u00edda vazia na origem`;
  const total=sum(records), critical=records.filter(x=>x.age>=25), old=records.filter(x=>x.age>=16), priority=records.filter(x=>x.priority);
  byId("criticalCount").textContent=`${integer.format(critical.length)} NFs`;
  byId("criticalValue").textContent=`acima de 25 dias \u00b7 ${money.format(sum(critical))}`;
  byId("kpis").innerHTML=[
    ["primary","VALOR SEM SA\u00cdDA","R$",money.format(total),"3,7% do faturamento da base"],
    ["","NOTAS SEM SA\u00cdDA","#",integer.format(records.length),`em ${new Set(records.map(x=>x.clientId)).size} clientes`],
    ["","CLIENTES PRIORIT\u00c1RIOS","!",integer.format(priority.length),`${money.format(sum(priority))} em NFs priorit\u00e1rias`],
    ["critical-card","MAIOR TEMPO","\u2197",`${Math.max(...records.map(x=>x.age))} dias`,"desde emiss\u00e3o da NF"]
  ].map(x=>`<article class="kpi-card ${x[0]}"><div class="kpi-label"><span>${x[1]}</span><i>${x[2]}</i></div><strong>${x[3]}</strong><p>${x[4]}</p></article>`).join("");
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
  let cursor=0; const segments=statuses.map(x=>{const start=cursor;cursor+=x.count/records.length*100;return`${colors[x.label]} ${start}% ${cursor}%`});
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
  renderTable();
}
init().catch(()=>{byId("updatedAt").textContent="N\u00e3o foi poss\u00edvel carregar a base.";});

