/* Mi Plata / Nova Bank — proyecto académico POO.
   La persistencia en localStorage es solo para demostración local, no producción. */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORE_KEY = 'miPlataUsers_v2';
const SESSION_KEY = 'miPlataSession_v2';
const money = value => new Intl.NumberFormat('es-CO', {style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(value)||0);
const dateLabel = value => new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));

class Cuenta {
  #saldo;
  constructor({id, tipo, saldo=0, estado='ACTIVA', movimientos=[]}) {
    this.id = id || `CTA-${Math.random().toString(36).slice(2,9).toUpperCase()}`;
    this.tipo = tipo; this.#saldo = Number(saldo)||0; this.estado=estado; this.movimientos=movimientos;
  }
  get saldo(){ return this.#saldo; }
  set saldo(value){ if (!Number.isFinite(Number(value))) throw new Error('El saldo debe ser numérico.'); this.#saldo=Number(value); }
  consignar(monto){ monto=validAmount(monto); this.#saldo += monto; return this.#saldo; }
  calcularRetiro(monto){ return monto <= this.#saldo; }
  retirar(monto){ monto=validAmount(monto); if(!this.calcularRetiro(monto)) throw new Error('Saldo insuficiente para este retiro.'); this.#saldo-=monto; return this.#saldo; }
  aplicarInteres(){ return 0; }
  descripcion(){ return this.tipo; }
  toJSON(){ return {id:this.id,tipo:this.tipo,saldo:this.#saldo,estado:this.estado,movimientos:this.movimientos}; }
}
class CuentaAhorros extends Cuenta {
  constructor(data={}){ super({...data,tipo:'AHORRO'}); this.tasaMensual=0.015; }
  aplicarInteres(){ const interes=this.saldo*this.tasaMensual; this.saldo=this.saldo+interes; return interes; }
  retirar(monto){ monto=validAmount(monto); const interes=this.aplicarInteres(); if(monto>this.saldo) { this.saldo-=interes; throw new Error('El retiro supera el saldo disponible.'); } super.retirar(monto); return {saldo:this.saldo,interes}; }
  descripcion(){ return `Cuenta de ahorros · interés mensual 1,5% al retirar`; }
}
class CuentaCorriente extends Cuenta {
  calcularRetiro(monto){ return monto <= this.saldo*1.2; }
  retirar(monto){ monto=validAmount(monto); if(!this.calcularRetiro(monto)) throw new Error(`Supera el límite de sobregiro del 20%. Máximo permitido: ${money(this.saldo*1.2)}.`); this.saldo=this.saldo-monto; return this.saldo; }
  descripcion(){ return 'Cuenta corriente · sobregiro hasta 20%'; }
}
class TarjetaCredito extends Cuenta {
  constructor(data={}){ super({...data,tipo:'CREDITO'}); this.cupo=Number(data.cupo)||3000000; this.deuda=Number(data.deuda)||0; this.compras=data.compras||[]; }
  calcularRetiro(){ return false; }
  calcularCuota(capital, cuotas){
    const tasa=cuotas<=2?0:(cuotas<=6?0.019:0.023);
    if(tasa===0) return {tasa,cuota:capital/cuotas,total:capital};
    const cuota=capital*tasa/(1-Math.pow(1+tasa,-cuotas));
    return {tasa,cuota,total:cuota*cuotas};
  }
  comprar(monto,cuotas){
    monto=validAmount(monto); cuotas=Number(cuotas);
    if(!Number.isInteger(cuotas)||cuotas<1||cuotas>48) throw new Error('Elige entre 1 y 48 cuotas.');
    if(monto+this.deuda>this.cupo) throw new Error(`Cupo insuficiente. Disponible: ${money(this.cupo-this.deuda)}.`);
    const calculo=this.calcularCuota(monto,cuotas);
    this.deuda+=calculo.total; this.saldo=this.cupo-this.deuda;
    const compra={id:cryptoId(),fecha:new Date().toISOString(),monto,cuotas,tasa:calculo.tasa,cuota:calculo.cuota,total:calculo.total};
    this.compras.push(compra); return compra;
  }
  descripcion(){ return `Tarjeta de crédito · cupo ${money(this.cupo)} · deuda ${money(this.deuda)}`; }
  toJSON(){return {...super.toJSON(),cupo:this.cupo,deuda:this.deuda,compras:this.compras};}
}
class Cliente {
  constructor(data={}){Object.assign(this,{id:data.id||cryptoId(),identificacion:data.identificacion||'',nombre:data.nombre||'',celular:data.celular||'',usuario:data.usuario||'',password:data.password||'',rol:data.rol||'cliente',bloqueado:!!data.bloqueado,intentos:Number(data.intentos)||0,cuentas:(data.cuentas||[]).map(c=>crearCuenta(c)),solicitudes:data.solicitudes||[]});}
  actualizar(datos){Object.assign(this,datos);}
  toJSON(){return {...this,cuentas:this.cuentas.map(c=>c.toJSON())};}
}
function crearCuenta(data){if(data.tipo==='AHORRO')return new CuentaAhorros(data);if(data.tipo==='CORRIENTE')return new CuentaCorriente(data);if(data.tipo==='CREDITO')return new TarjetaCredito(data);return new Cuenta(data);}
function cryptoId(){return (window.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`);}
function validAmount(value){const n=Number(value);if(!Number.isFinite(n)||n<=0)throw new Error('El monto debe ser un número positivo mayor a cero.');return n;}
function loadUsers(){try{return JSON.parse(localStorage.getItem(STORE_KEY)||'[]').map(u=>new Cliente(u));}catch{return [];}}
function saveUsers(){localStorage.setItem(STORE_KEY,JSON.stringify(users.map(u=>u.toJSON())));}
let users=loadUsers(), currentUser=null, selectedAccountId=null, activeView='overview';
if(!users.length){users=[new Cliente({identificacion:'ADMIN-001',nombre:'Administrador Mi Plata',celular:'3000000000',usuario:'admin',password:'MiPlata123!',rol:'admin',cuentas:[{tipo:'AHORRO',saldo:2500000},{tipo:'CORRIENTE',saldo:1200000},{tipo:'CREDITO',cupo:5000000,saldo:5000000}]})];saveUsers();}
function toast(message,type='success'){const node=$('#app-feedback');if(!node)return;node.hidden=false;node.className=`app-feedback ${type}`;node.textContent=message;window.setTimeout(()=>{node.hidden=true;},5200);}
function landing(show=true){$('#bank-app').hidden=true;$$('main > section:not(#bank-app)').forEach(el=>el.hidden=!show);$('.footer').hidden=!show;$('.hero').scrollIntoView({behavior:'smooth',block:'start'});}
function setAuthMode(mode){$$('.auth-tab').forEach(b=>b.classList.toggle('active',b.dataset.auth===mode));$('#login-form').hidden=mode!=='login';$('#register-form').hidden=mode!=='register';$('#login-attempts').textContent='Intentos fallidos: 0 de 3';}
function openAuth(mode){setAuthMode(mode);$('#auth-dialog').showModal();}
$('#open-login').addEventListener('click',()=>openAuth('login'));
$('#open-register').addEventListener('click',()=>openAuth('register'));
$('#auth-close').addEventListener('click',()=>$('#auth-dialog').close());
$$('.auth-tab').forEach(b=>b.addEventListener('click',()=>setAuthMode(b.dataset.auth)));
$('#login-form').addEventListener('submit',event=>{
  event.preventDefault();
  const username=$('#login-username').value.trim().toLowerCase(), password=$('#login-password').value;
  const user=users.find(u=>u.usuario.toLowerCase()===username);
  if(!user){$('#login-attempts').textContent='Intentos fallidos: 1 de 3 · Usuario o contraseña incorrectos.';toast('Usuario o contraseña incorrectos.','error');return;}
  if(user.bloqueado){toast('Esta cuenta está bloqueada después de tres intentos fallidos.','error');$('#login-attempts').textContent='Cuenta bloqueada: contacta al administrador.';return;}
  if(user.password!==password){user.intentos++;if(user.intentos>=3)user.bloqueado=true;saveUsers();$('#login-attempts').textContent=user.bloqueado?'Cuenta bloqueada después de 3 intentos.':`Intentos fallidos: ${user.intentos} de 3`;toast(user.bloqueado?'Cuenta bloqueada después de tres intentos.':'Usuario o contraseña incorrectos.','error');return;}
  user.intentos=0;saveUsers();currentUser=user;selectedAccountId=user.cuentas[0]?.id;sessionStorage.setItem(SESSION_KEY,user.id);$('#auth-dialog').close();enterDashboard();
});
$('#register-form').addEventListener('submit',event=>{
  event.preventDefault();
  const identificacion=$('#reg-id').value.trim(), nombre=$('#reg-name').value.trim(), celular=$('#reg-phone').value.trim(), usuario=$('#reg-username').value.trim(), password=$('#reg-password').value;
  if(password!==$('#reg-confirm').value){toast('Las contraseñas no coinciden.','error');return;}
  if(users.some(u=>u.usuario.toLowerCase()===usuario.toLowerCase())){toast('Ese nombre de usuario ya existe. Elige otro.','error');return;}
  if(users.some(u=>u.identificacion===identificacion)){toast('Ya existe un cliente con esa identificación.','error');return;}
  const user=new Cliente({identificacion,nombre,celular,usuario,password,cuentas:[{tipo:'AHORRO',saldo:0},{tipo:'CORRIENTE',saldo:0},{tipo:'CREDITO',cupo:3000000,saldo:3000000}]});
  users.push(user);saveUsers();currentUser=user;selectedAccountId=user.cuentas[0].id;sessionStorage.setItem(SESSION_KEY,user.id);$('#auth-dialog').close();enterDashboard();toast('Registro exitoso. Ya puedes usar tus productos.');
});
function enterDashboard(){landing(false);$('#bank-app').hidden=false;$('#welcome-title').textContent=`Hola, ${currentUser.nombre.split(' ')[0]}`;$('#users-nav').hidden=currentUser.rol!=='admin';renderView('overview');$('#bank-app').scrollIntoView({behavior:'smooth'});}
$('#logout-button').addEventListener('click',()=>{currentUser=null;sessionStorage.removeItem(SESSION_KEY);landing(true);toast('Sesión cerrada correctamente.');});
function accountOptions(excludeId=''){return currentUser.cuentas.filter(a=>a.id!==excludeId).map(a=>`<option value="${a.id}">${escapeHTML(a.tipo)} · ${escapeHTML(a.id.slice(-7))} · ${money(a.saldo)}</option>`).join('');}
function accountById(id){return currentUser.cuentas.find(a=>a.id===id);}
function escapeHTML(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function record(account,type,value,details=''){account.movimientos.push({fecha:new Date().toISOString(),tipo:type,valor:Number(value),detalles:details,cuenta:account.id});}
function renderView(view){activeView=view;$$('.app-nav').forEach(b=>b.classList.toggle('active',b.dataset.view===view));const root=$('#app-view');const total=currentUser.cuentas.filter(a=>a.tipo!=='CREDITO').reduce((s,a)=>s+a.saldo,0);const credit=currentUser.cuentas.find(a=>a.tipo==='CREDITO');let html='';
if(view==='overview'){
 html=`<div class="dashboard-heading"><div><span class="eyebrow">TU RESUMEN</span><h3>Vista general</h3></div><span class="date-pill">${new Date().toLocaleDateString('es-CO',{dateStyle:'long'})}</span></div>
 <div class="balance-tiles"><article><span>Saldo en cuentas</span><strong>${money(total)}</strong><small>Disponible en ahorro y corriente</small></article><article><span>Cupo disponible</span><strong>${money(credit?credit.cupo-credit.deuda:0)}</strong><small>Tarjeta de crédito</small></article><article><span>Mis productos</span><strong>${currentUser.cuentas.length}</strong><small>Cuentas y tarjetas activas</small></article></div>
 <div class="panel-card"><div class="panel-title"><h3>Mis productos</h3><span>Selecciona para operar</span></div><div class="account-list">${currentUser.cuentas.map(a=>`<button class="account-row ${selectedAccountId===a.id?'selected':''}" data-account="${a.id}"><span class="account-symbol">${a.tipo==='AHORRO'?'◈':a.tipo==='CORRIENTE'?'↔':'▤'}</span><span class="account-meta"><b>${a.tipo==='AHORRO'?'Cuenta de ahorros':a.tipo==='CORRIENTE'?'Cuenta corriente':'Tarjeta de crédito'}</b><small>${escapeHTML(a.id)}</small></span><strong>${money(a.tipo==='CREDITO'?a.cupo-a.deuda:a.saldo)}</strong><span>›</span></button>`).join('')}</div></div>
 <div class="panel-card"><div class="panel-title"><h3>Últimos movimientos</h3><button class="small-action" data-goto="movements">Ver todos →</button></div>${movementTable(allMovements().slice(0,5))}</div>`;
}else if(view==='transactions'){
 html=`<div class="dashboard-heading"><div><span class="eyebrow">OPERACIONES</span><h3>Consignar y retirar</h3></div></div><div class="operation-grid">
 <form class="panel-card operation-form" id="deposit-form"><h3>Consignar dinero</h3><p>Agrega dinero a una cuenta de ahorro o corriente.</p><label>Cuenta de destino</label><select name="account" required>${currentUser.cuentas.filter(a=>a.tipo!=='CREDITO').map(a=>`<option value="${a.id}">${a.tipo} · ${money(a.saldo)}</option>`).join('')}</select><label>Monto (COP)</label><input name="amount" type="number" min="1" step="1" placeholder="Ej. 100000" required><button class="btn btn-primary btn-full">Consignar dinero</button></form>
 <form class="panel-card operation-form" id="withdraw-form"><h3>Retirar dinero</h3><p>Se aplican las reglas del producto seleccionado.</p><label>Cuenta de retiro</label><select name="account" required>${currentUser.cuentas.filter(a=>a.tipo!=='CREDITO').map(a=>`<option value="${a.id}">${a.tipo} · ${money(a.saldo)}</option>`).join('')}</select><label>Monto (COP)</label><input name="amount" type="number" min="1" step="1" placeholder="Ej. 50000" required><button class="btn btn-primary btn-full">Retirar dinero</button><small class="form-note">Ahorros: interés mensual del 1,5% al retirar. Corriente: sobregiro máximo del 20%.</small></form></div>`;
}else if(view==='transfer'){
 html=`<div class="dashboard-heading"><div><span class="eyebrow">MOVER DINERO</span><h3>Transferencias</h3></div></div><form class="panel-card operation-form transfer-form" id="transfer-form"><p>Transfiere entre tus propios productos o a una cuenta de otro cliente registrado.</p><label>Cuenta de origen</label><select id="transfer-source" name="source" required>${currentUser.cuentas.filter(a=>a.tipo!=='CREDITO').map(a=>`<option value="${a.id}">${a.tipo} · ${money(a.saldo)}</option>`).join('')}</select><label>Destino</label><select id="transfer-destination" name="destination" required><optgroup label="Mis productos">${currentUser.cuentas.filter(a=>a.tipo!=='CREDITO').map(a=>`<option value="${a.id}">Mi ${a.tipo} · ${money(a.saldo)}</option>`).join('')}</optgroup><optgroup label="Otros clientes">${users.filter(u=>u.id!==currentUser.id).flatMap(u=>u.cuentas.filter(a=>a.tipo!=='CREDITO').map(a=>`<option value="${u.id}|${a.id}">${escapeHTML(u.nombre)} · ${a.tipo}</option>`)).join('')}</optgroup></select><label>Monto (COP)</label><input name="amount" type="number" min="1" step="1" required placeholder="Ej. 100000"><button class="btn btn-primary">Confirmar transferencia →</button></form>`;
}else if(view==='movements'){html=`<div class="dashboard-heading"><div><span class="eyebrow">HISTORIAL</span><h3>Todos los movimientos</h3></div></div><div class="panel-card"><div class="panel-title"><h3>Actividad reciente</h3><span>Ordenado del más reciente al más antiguo</span></div>${movementTable(allMovements())}</div>`;}
else if(view==='cards'){
 const card=currentUser.cuentas.find(a=>a.tipo==='CREDITO');
 html=`<div class="dashboard-heading"><div><span class="eyebrow">COMPRAS FINANCIADAS</span><h3>Tarjeta de crédito</h3></div></div><div class="credit-overview"><div><span>Cupo total</span><strong>${money(card.cupo)}</strong></div><div><span>Deuda estimada</span><strong>${money(card.deuda)}</strong></div><div><span>Cupo disponible</span><strong>${money(card.cupo-card.deuda)}</strong></div></div><form class="panel-card operation-form" id="purchase-form"><h3>Registrar una compra</h3><p>La tasa se determina según el número de cuotas: hasta 2 cuotas 0%, de 3 a 6 cuotas 1,9% mensual, y 7 o más cuotas 2,3% mensual.</p><label>Valor de la compra (COP)</label><input id="purchase-amount" name="amount" type="number" min="1" max="${Math.max(1,card.cupo-card.deuda)}" required placeholder="Ej. 450000"><label>Número de cuotas</label><select id="purchase-terms" name="terms">${[1,2,3,4,5,6,7,8,9,10,12,18,24,36,48].map(n=>`<option value="${n}">${n} ${n===1?'cuota':'cuotas'}</option>`).join('')}</select><div class="purchase-estimate" id="purchase-estimate">Ingresa el valor para ver la cuota mensual.</div><button class="btn btn-primary btn-full">Registrar compra</button></form><div class="panel-card"><div class="panel-title"><h3>Compras registradas</h3></div>${card.compras.length?`<div class="movement-list">${[...card.compras].reverse().map(c=>`<div class="movement-row"><span class="movement-symbol">▤</span><span class="movement-info"><b>Compra a ${c.cuotas} cuotas</b><small>${dateLabel(c.fecha)} · tasa ${(c.tasa*100).toFixed(1)}% mensual</small></span><span class="movement-amount"><b>${money(c.monto)}</b><small>${money(c.cuota)} / mes</small></span></div>`).join('')}</div>`:'<p class="empty-state">Aún no has registrado compras.</p>'}`;
}else if(view==='profile'){
 html=`<div class="dashboard-heading"><div><span class="eyebrow">TUS DATOS</span><h3>Mi perfil y seguridad</h3></div></div><form class="panel-card operation-form" id="profile-form"><h3>Editar perfil</h3><label>Identificación</label><input name="identificacion" required value="${escapeHTML(currentUser.identificacion)}"><label>Nombre completo</label><input name="nombre" required value="${escapeHTML(currentUser.nombre)}"><label>Celular</label><input name="celular" required value="${escapeHTML(currentUser.celular)}"><label>Nombre de usuario</label><input name="usuario" required value="${escapeHTML(currentUser.usuario)}"><button class="btn btn-primary">Guardar cambios</button></form><form class="panel-card operation-form" id="password-form"><h3>Cambiar contraseña</h3><label>Usuario</label><input name="usuario" required value="${escapeHTML(currentUser.usuario)}"><label>Contraseña actual</label><input name="actual" type="password" required><label>Nueva contraseña</label><input name="nueva" type="password" minlength="6" required><label>Confirmar nueva contraseña</label><input name="confirmar" type="password" minlength="6" required><button class="btn btn-primary">Actualizar contraseña</button></form>`;
}else if(view==='users'){
 if(currentUser.rol!=='admin'){renderView('overview');return;}
 html=`<div class="dashboard-heading"><div><span class="eyebrow">ADMINISTRACIÓN</span><h3>Gestión de usuarios</h3></div><button class="btn btn-primary" id="add-user">+ Agregar usuario</button></div><div class="panel-card"><div class="panel-title"><h3>Usuarios registrados</h3><span>CRUD · agregar, editar y eliminar</span></div><div class="table-wrap"><table class="users-table"><thead><tr><th>Cliente</th><th>Usuario</th><th>Identificación</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${users.map(u=>`<tr><td>${escapeHTML(u.nombre)}</td><td>${escapeHTML(u.usuario)}</td><td>${escapeHTML(u.identificacion)}</td><td>${u.bloqueado?'Bloqueado':'Activo'}</td><td><button class="small-action" data-edit-user="${u.id}">Editar</button> <button class="small-action danger" data-delete-user="${u.id}" ${u.id===currentUser.id?'disabled':''}>Eliminar</button></td></tr>`).join('')}</tbody></table></div></div>`;
}
root.innerHTML=html;wireView();
}
function allMovements(){return currentUser.cuentas.flatMap(a=>a.movimientos.map(m=>({...m,cuentaTipo:a.tipo}))).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));}
function movementTable(items){if(!items.length)return '<p class="empty-state">Todavía no hay movimientos. Haz una consignación o registra una compra para empezar.</p>';return `<div class="movement-list">${items.map(m=>`<div class="movement-row"><span class="movement-symbol">${m.tipo==='Consignación'?'↓':m.tipo==='Retiro'?'↑':m.tipo==='Transferencia recibida'?'↙':m.tipo==='Compra con tarjeta'?'▤':'↗'}</span><span class="movement-info"><b>${escapeHTML(m.tipo)}</b><small>${dateLabel(m.fecha)} · ${escapeHTML(m.cuentaTipo||'Cuenta')} ${m.detalles?'· '+escapeHTML(m.detalles):''}</small></span><span class="movement-amount ${m.tipo.includes('recibida')||m.tipo==='Consignación'?'positive':''}"><b>${money(m.valor)}</b></span></div>`).join('')}</div>`;}
function wireView(){
 $$('.app-nav').forEach(b=>b.onclick=()=>renderView(b.dataset.view));
 $$('[data-account]').forEach(b=>b.onclick=()=>{selectedAccountId=b.dataset.account;renderView('overview');});
 $$('[data-goto]').forEach(b=>b.onclick=()=>renderView(b.dataset.goto));
 const deposit=$('#deposit-form');if(deposit)deposit.onsubmit=e=>{e.preventDefault();try{const a=accountById(deposit.account.value),amount=validAmount(deposit.amount.value);a.consignar(amount);record(a,'Consignación',amount);saveUsers();renderView('transactions');toast(`Consignación realizada. Nuevo saldo: ${money(a.saldo)}.`);}catch(err){toast(err.message,'error');}};
 const withdraw=$('#withdraw-form');if(withdraw)withdraw.onsubmit=e=>{e.preventDefault();try{const a=accountById(withdraw.account.value),amount=validAmount(withdraw.amount.value);const result=a.retirar(amount);record(a,'Retiro',amount,a.tipo==='AHORRO'?'Interés aplicado: '+money(result.interes):'');saveUsers();renderView('transactions');toast(a.tipo==='AHORRO'?`Retiro exitoso. Interés aplicado: ${money(result.interes)}. Saldo: ${money(a.saldo)}.`:`Retiro exitoso. Nuevo saldo: ${money(a.saldo)}.`);}catch(err){toast(err.message,'error');}};
 const transfer=$('#transfer-form');if(transfer)transfer.onsubmit=e=>{e.preventDefault();try{const source=accountById(transfer.source.value),amount=validAmount(transfer.amount.value),destValue=transfer.destination.value;let destUser=currentUser,dest;if(destValue.includes('|')){const [uid,aid]=destValue.split('|');destUser=users.find(u=>u.id===uid);dest=destUser?.cuentas.find(a=>a.id===aid);}else dest=accountById(destValue);if(!dest)throw new Error('No se encontró la cuenta destino.');if(source.id===dest.id)throw new Error('No se permiten transferencias al mismo producto.');source.retirar(amount);dest.consignar(amount);record(source,'Transferencia enviada',amount,`Destino: ${destUser.nombre} (${dest.tipo})`);record(dest,'Transferencia recibida',amount,`Origen: ${currentUser.nombre}`);saveUsers();renderView('transfer');toast(`Transferencia realizada por ${money(amount)}.`);}catch(err){toast(err.message,'error');}};
 const profile=$('#profile-form');if(profile)profile.onsubmit=e=>{e.preventDefault();const f=new FormData(profile),username=String(f.get('usuario')).trim();if(users.some(u=>u.id!==currentUser.id&&u.usuario.toLowerCase()===username.toLowerCase())){toast('Ese nombre de usuario ya está ocupado.','error');return;}currentUser.actualizar({identificacion:String(f.get('identificacion')).trim(),nombre:String(f.get('nombre')).trim(),celular:String(f.get('celular')).trim(),usuario:username});saveUsers();$('#welcome-title').textContent=`Hola, ${currentUser.nombre.split(' ')[0]}`;renderView('profile');toast('Perfil actualizado correctamente.');};
 const password=$('#password-form');if(password)password.onsubmit=e=>{e.preventDefault();const f=new FormData(password);if(f.get('usuario')!==currentUser.usuario||f.get('actual')!==currentUser.password){toast('Usuario o contraseña actual incorrectos.','error');return;}if(f.get('nueva')!==f.get('confirmar')){toast('La nueva contraseña y su confirmación no coinciden.','error');return;}currentUser.password=String(f.get('nueva'));saveUsers();password.reset();toast('Contraseña actualizada correctamente.');};
 const purchase=$('#purchase-form');if(purchase){const estimate=()=>{const amount=Number($('#purchase-amount').value)||0,terms=Number($('#purchase-terms').value),rate=terms<=2?0:terms<=6?.019:.023;let payment=rate===0?amount/terms:amount*rate/(1-Math.pow(1+rate,-terms));$('#purchase-estimate').innerHTML=amount>0?`<span>Tasa mensual: ${(rate*100).toFixed(1)}%</span><strong>${money(payment)} / mes</strong><small>Total estimado: ${money(payment*terms)}</small>`:'Ingresa el valor para ver la cuota mensual.';};$('#purchase-amount').addEventListener('input',estimate);$('#purchase-terms').addEventListener('change',estimate);estimate();purchase.onsubmit=e=>{e.preventDefault();try{const card=currentUser.cuentas.find(a=>a.tipo==='CREDITO');const item=card.comprar(purchase.amount.value,purchase.terms.value);record(card,'Compra con tarjeta',item.monto,`${item.cuotas} cuotas · cuota mensual ${money(item.cuota)}`);saveUsers();renderView('cards');toast(`Compra registrada. Cuota mensual: ${money(item.cuota)} por ${item.cuotas} meses.`);}catch(err){toast(err.message,'error');}};}
 const add=$('#add-user');if(add)add.onclick=()=>{const username=prompt('Nombre de usuario para el nuevo cliente:');if(!username)return;if(users.some(u=>u.usuario.toLowerCase()===username.trim().toLowerCase())){toast('Ese usuario ya existe.','error');return;}const nombre=prompt('Nombre completo:');if(!nombre)return;const identificacion=prompt('Cédula o pasaporte:')||'';const celular=prompt('Número de celular:')||'';const password=prompt('Contraseña temporal (mínimo 6 caracteres):');if(!password||password.length<6){toast('La contraseña debe tener al menos 6 caracteres.','error');return;}users.push(new Cliente({usuario:username.trim(),nombre:nombre.trim(),identificacion,celular,password,cuentas:[{tipo:'AHORRO',saldo:0},{tipo:'CORRIENTE',saldo:0},{tipo:'CREDITO',cupo:3000000,saldo:3000000}]}));saveUsers();renderView('users');toast('Usuario agregado correctamente.');};
 $$('[data-edit-user]').forEach(b=>b.onclick=()=>{const u=users.find(x=>x.id===b.dataset.editUser);if(!u)return;const nombre=prompt('Editar nombre completo:',u.nombre);if(nombre===null)return;const celular=prompt('Editar celular:',u.celular);if(celular===null)return;const identificacion=prompt('Editar identificación:',u.identificacion);if(identificacion===null)return;u.nombre=nombre.trim();u.celular=celular.trim();u.identificacion=identificacion.trim();saveUsers();renderView('users');toast('Usuario actualizado.');});
 $$('[data-delete-user]').forEach(b=>b.onclick=()=>{if(b.disabled)return;const u=users.find(x=>x.id===b.dataset.deleteUser);if(!u||!confirm(`¿Seguro que deseas eliminar al usuario ${u.nombre}? Esta acción no se puede deshacer.`))return;users=users.filter(x=>x.id!==u.id);saveUsers();renderView('users');toast('Usuario eliminado.');});
}
const authSession=sessionStorage.getItem(SESSION_KEY);if(authSession){const match=users.find(u=>u.id===authSession);if(match){currentUser=match;selectedAccountId=match.cuentas[0]?.id;enterDashboard();}else sessionStorage.removeItem(SESSION_KEY);}

/* Landing page's original product request form and loan calculator. */
const requestDialog=$('#request-dialog');
function openProductRequest(product='Nova Esencial'){if(!requestDialog)return;$('#request-product').value=product;$('#dialog-title').textContent=product==='Préstamo personal'?'Solicita tu préstamo':'Solicita tu producto';$('#dialog-description').textContent=`Has elegido ${product}. Completa tus datos para preparar la solicitud de demostración.`;$('#request-form').hidden=false;$('#success-message').hidden=true;requestDialog.showModal();}
$$('.apply-card').forEach(button=>button.addEventListener('click',()=>openProductRequest(button.dataset.card)));
$('#contact-open')?.addEventListener('click',()=>openProductRequest('Nova Esencial'));
$$('.dialog-close',requestDialog||document).filter(b=>b.id!=='auth-close').forEach(button=>button.addEventListener('click',()=>requestDialog?.close()));
$('#close-success')?.addEventListener('click',()=>requestDialog.close());
requestDialog?.addEventListener('click',event=>{if(event.target===requestDialog)requestDialog.close();});
$('#request-form')?.addEventListener('submit',event=>{event.preventDefault();if(!event.currentTarget.reportValidity())return;$('#request-form').hidden=true;$('#success-message').hidden=false;});
const amountInput=$('#loan-amount'),amountRange=$('#amount-range'),termInput=$('#loan-term'),rateInput=$('#loan-rate'),paymentOutput=$('#monthly-payment');
const formatCOP=value=>money(value);
function calculatePayment(){if(!amountInput)return;const principal=Math.max(0,Number(amountInput.value)||0),months=Math.max(1,Number(termInput.value)||1),rate=Math.max(0,Number(rateInput.value)||0)/1200;paymentOutput.textContent=formatCOP(rate===0?principal/months:principal*rate/(1-Math.pow(1+rate,-months)));}
amountInput?.addEventListener('input',()=>{amountRange.value=Math.min(Number(amountInput.max),Math.max(Number(amountInput.min),Number(amountInput.value)||Number(amountInput.min)));calculatePayment();});
amountRange?.addEventListener('input',()=>{amountInput.value=amountRange.value;calculatePayment();});
termInput?.addEventListener('change',calculatePayment);rateInput?.addEventListener('input',calculatePayment);
$('#loan-form')?.addEventListener('submit',event=>{event.preventDefault();calculatePayment();openProductRequest('Préstamo personal');});calculatePayment();
const menuToggle=$('.menu-toggle'),navLinks=$('.nav-links');
menuToggle?.addEventListener('click',()=>{const open=navLinks.classList.toggle('open');menuToggle.setAttribute('aria-expanded',String(open));menuToggle.setAttribute('aria-label',open?'Cerrar menú':'Abrir menú');});
$$('.nav-links a').forEach(link=>link.addEventListener('click',()=>{navLinks.classList.remove('open');menuToggle?.setAttribute('aria-expanded','false');}));
