/* ---------- METAS CELL STORE (app separado do Portal) ----------
   Gerente (login da loja): abre no fechamento do dia; painel da loja embaixo.
   Gestão e Admin: visão das lojas, metas em lote, calendário, avisos, relatório.
   Telas por endereço (#/…): o "voltar" do celular anda um passo, como nos outros apps. */
import * as MR from "./regras.js?v=202611151803";
import { criarApi, hoje } from "./api.js?v=202611151803";

const api = criarApi(window.CONFIG);
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const R = MR.R, P = MR.P, data = MR.data, nomeMes = MR.nomeMes;
// valor de um campo: aceita contas como "150+200+80" ou "1.200-50" (o gerente digita as anotações e o app soma)
const num1 = t => { t = t.replace(/[^\d,.]/g, ""); if (!t) return 0; const x = parseFloat(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/\.(?=\d{3}(\D|$))/g, "")); return isFinite(x) ? x : 0; };
const num = s => { let tot = 0; String(s ?? "").replace(/\s/g, "").split(/(?=[+-])/).forEach(p => { const v = num1(p); tot += p.startsWith("-") ? -v : v; }); tot = Math.round(tot * 100) / 100; return tot > 0 ? tot : 0; };
const ehConta = s => /\d\s*[+-]\s*\d/.test(String(s || ""));
const contaTxt = s => ehConta(s) ? `= ${R(num(s))}` : "";
const campo = n => n ? Number(n).toLocaleString("pt-BR") : "";
const r10 = x => Math.round(x / 10) * 10;
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }, del(k) { try { localStorage.removeItem(k); } catch (e) { } } };

const ICON = {
  sino: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  ok: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  doc: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  mais: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  instalar: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M12 7v7m-3-3 3 3 3-3"/></svg>',
};

const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

/* ---------- estado ---------- */
const S = { perfil: null, lojas: [], mes: hoje().slice(0, 7) + "-01", dados: null, carregando: null, edicao: null, cache: { d: null, L: null }, foco: null };
const papel = () => S.perfil && S.perfil.papel;
const ehRede = () => ["gestao", "admin"].includes(papel());
const ctx = () => ({ hoje: hoje(), papel: papel(), lojaId: S.perfil && S.perfil.loja_id, lojas: S.lojas });
const mesAtual = () => hoje().slice(0, 7) + "-01";
const lojaPor = id => S.dados.lojas.find(l => l.id === id);
const minhaLoja = () => lojaPor(S.perfil.loja_id);
async function carregar() {
  const mes = S.mes, p = api.metasMes(mes); S.carregando = p;
  try { const d = await p; if (mes === S.mes) { S.dados = MR.montar(mes, d, ctx()); S.cache.d = null; } }
  finally { if (S.carregando === p) S.carregando = null; }
}
// avisos calculados uma vez por carga de dados
function avisos() {
  if (S.cache.d !== S.dados) S.cache = { d: S.dados, L: MR.doPapel(MR.visiveis(MR.avisos(S.dados, ctx()), S.dados.vistos, S.dados.cfg), ctx()) };
  return S.cache.L;
}

/* ---------- utilidades de tela ---------- */
function toast(m, ms = 2800) { const t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); }
function erro(e) { console.error(e); toast(e && e.message ? e.message : "Algo deu errado. Tente de novo.", 4500); }
function modal(html, aoAbrir, classe = "") {
  const m = $("modal"); m.innerHTML = `<div class="box ${classe}" role="dialog" aria-modal="true"><div class="mt" style="display:grid;gap:14px">${html}</div></div>`; m.hidden = false;
  m.onclick = e => { if (e.target === m) fecharModal(); };
  if (aoAbrir) aoAbrir();
}
function fecharModal() { $("modal").hidden = true; $("modal").innerHTML = ""; }
function confirmar(titulo, texto, botao, fn) {
  modal(`<h2>${titulo}</h2><p class="lead" style="margin:0">${texto}</p><div class="nav"><button class="btn soft" id="cn">Voltar</button><button class="btn primary" id="cs">${botao}</button></div>`, () => {
    $("cn").onclick = fecharModal; $("cs").onclick = () => { fecharModal(); fn(); };
  });
}
const COR = { g: "No ritmo", a: "Atenção", r: "Abaixo" };
const chip = c => c ? `<span class="cor ${c}">${COR[c]}</span>` : `<span class="cor p">Sem meta</span>`;
const barra = (c, cls = "") => `<div class="mbar ${c.cor} ${cls}" role="img" aria-label="${P(c.pct)} da meta; deveria estar em ${P(c.ideal)}"><i style="width:${Math.min(100, c.pct * 100)}%"></i>${c.meta ? `<b style="left:${Math.min(100, c.ideal * 100)}%"></b>` : ""}</div>`;
const corPrev = p => p >= 1 ? "g" : p >= .9 ? "a" : "r";

/* ---------- rotas ---------- */
const rota = () => { const [nome, arg] = location.hash.replace(/^#\/?/, "").split("/"); return { nome: nome || "inicio", arg: arg && decodeURIComponent(arg) }; };
let navegou = false;
const ir = h => { if (location.hash === h) desenhar(); else location.hash = h; };
const voltar = () => navegou ? history.back() : ir("#/");
addEventListener("hashchange", () => { navegou = true; fecharModal(); desenhar(); scrollTo(0, 0); });
addEventListener("beforeunload", e => { if (sujo()) { e.preventDefault(); e.returnValue = ""; } });

/* ---------- login ---------- */
async function telaLogin() {
  $("top").hidden = true;
  $("app").className = "wrap";
  $("app").innerHTML = `<div class="mlogin">
    <div class="mbanner"><span class="logo" role="img" aria-label="Cell Store"></span><span class="tag">METAS</span>
      <h1>Fechamento do dia<span>e metas das lojas</span></h1><p>O gerente fecha o dia em 1 minuto. A rede vê onde cada loja e vendedor está na meta.</p>
      <img src="icone-192.png" alt="" class="ic"></div>
    <form class="painel" id="flogin" style="gap:14px">
      <label class="f" id="ucampo"><span>Quem está entrando?</span><select id="usuario" disabled><option>Carregando…</option></select></label>
      <label class="f"><span>Senha</span><input id="senha" type="password" autocomplete="current-password" required></label>
      <p class="err" id="lerr" hidden></p>
      <button class="btn primary" id="bentrar">Entrar</button>
      ${api.modo === "demo" ? `<p class="hint" style="margin:0">Demonstração: lojas com a senha 1234 · gestao/gestao · admin/admin.</p>` : ""}
    </form>
    <button class="soft mini instalar" hidden>${ICON.instalar}Instalar o app</button></div>`;
  mostrarInstalar();
  const e = m => { $("lerr").textContent = m; $("lerr").hidden = false; };
  try {
    const L = await api.logins(), ult = ls.get("metas-ultimo") || "";
    const grupos = [["loja", "Lojas"], ["gestao", "Gestão"], ["admin", "Admin"]];
    $("ucampo").innerHTML = `<span>Quem está entrando?</span><select id="usuario" required><option value="">Escolha na lista</option>${grupos.map(([p, n]) => { const g = L.filter(x => x.papel === p); return g.length ? `<optgroup label="${n}">${g.map(x => `<option value="${esc(x.usuario)}" ${x.usuario === ult ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</optgroup>` : ""; }).join("")}</select>`;
  } catch (er) { $("ucampo").innerHTML = `<span>Usuário</span><input id="usuario" autocomplete="username" autocapitalize="none" placeholder="Ex.: loja03" required>`; }
  $("flogin").onsubmit = async ev => {
    ev.preventDefault();
    const u = $("usuario").value, s = $("senha").value; if (!u) return e("Escolha quem está entrando.");
    $("bentrar").disabled = true; $("bentrar").textContent = "Entrando…";
    try { S.perfil = await api.entrar(u, s); ls.set("metas-ultimo", u); await iniciar(); }
    catch (er) { $("senha").value = ""; e(er.message); $("bentrar").disabled = false; $("bentrar").textContent = "Entrar"; }
  };
}

/* ---------- cabeçalho da página ---------- */
function cabeca(titulo, { voltar: v = false, mes = true } = {}) {
  return `<div class="phead">${v ? `<button class="link voltar" data-a="voltar">‹ Voltar</button>` : ""}<h1>${titulo}</h1>
    ${mes ? `<span class="mes"><button class="link" data-a="mes" data-k="-1" aria-label="Mês anterior">‹</button><b>${nomeMes(S.mes)}</b><button class="link" data-a="mes" data-k="1" aria-label="Próximo mês">›</button></span>` : ""}</div>
    ${mes && S.mes !== mesAtual() ? `<button class="link" data-a="mes-atual" style="padding:0 0 8px;color:var(--accent)">Voltar para ${nomeMes(mesAtual()).toLowerCase()}</button>` : ""}`;
}

/* ---------- peças ---------- */
function cardVend(v, l) {
  const cv = MR.contaVend(S.dados, v, l), t = cv.tot;
  if (!v.meta) return `<div class="vend"><div class="cab"><h3>${esc(v.nome)}</h3><span class="cor p">Sem meta</span></div><div class="pe"><span>Vendeu <b>${R(t.real)}</b></span><span>Assist. ${R(cv.a.real)} · Vendas ${R(cv.v.real)}</span></div></div>`;
  const cat = (nome, c) => `<div class="cat"><div class="l"><span style="color:var(--fg)">${nome}</span><span class="txt-${c.cor}">${P(c.pct)}</span></div>${barra(c, "fina")}</div>`;
  return `<div class="vend ${t.cor}" id="v-${v.id}"><div class="cab"><h3>${esc(v.nome)}</h3>${chip(t.cor)}<span class="pct txt-${t.cor}">${P(t.pct)}</span></div>
    ${barra(t)}<div class="mini2">${cat("Assistência", cv.a)}${cat("Vendas", cv.v)}</div>
    <div class="pe"><span>Vendeu <b>${R(t.real)}</b> de ${R(t.meta)}</span><span>Precisa <b>${R(t.diaria)}/dia</b></span><span>Previsão <b class="txt-${corPrev(t.projPct)}">${t.n ? P(t.projPct) : "—"}</b></span></div></div>`;
}
function diasLoja(l, rede) {
  const hj = S.dados.hj, SIM = { f: "✓", re: "↺", p: "!", h: "•", s: "Σ" };
  const cel = l.diasV.map(dia => {
    const f = l.fech.get(dia), corr = f && (f.reaberto_em || l.corr.some(c => c.fechamento_id === f.id));
    let cls = "", tit = data(dia);
    if (l.ate && dia <= l.ate) { cls = "s"; tit += " · no saldo de abertura"; }
    else if (f && f.status === "fechado") { cls = corr ? "re" : "f"; tit += corr ? " · corrigido" : " · fechado"; }
    else if (dia < hj) { cls = "p"; tit += f ? " · reaberto, falta lançar de novo" : " · fechamento pendente"; }
    else if (dia === hj) { cls = "h"; tit += " · hoje"; }
    const n = +dia.slice(8), dentro = `<span>${n}</span>${cls ? `<em>${SIM[cls]}</em>` : ""}`;
    return rede && dia <= hj && cls !== "s" ? `<button class="${cls}" data-a="dia" data-dia="${dia}" title="${tit} · toque para ver ou corrigir">${dentro}</button>` : `<div class="${cls}" title="${tit}">${dentro}</div>`;
  }).join("");
  return `<div class="dias dias2">${cel || `<span class="hint">Nenhum dia de venda neste mês.</span>`}</div>
  <div class="leg-dias"><span style="--c:var(--g-soft)">✓ Fechado</span><span style="--c:var(--a-soft)">↺ Corrigido</span><span style="--c:var(--r-soft)">! Pendente</span><span style="--c:var(--accent-soft)">• Hoje</span>${l.ate ? `<span style="--c:var(--sunk)">Σ Saldo de abertura</span>` : ""}</div>
  <p class="hint" style="margin:0">${rede ? "Toque num dia para lançar, corrigir ou reabrir para o gerente." : "Dia fechado não muda mais. Se precisar corrigir, peça à gestão para reabrir."}</p>`;
}
function listaAvisos(L, { max = 0, agrupar = false } = {}) {
  if (!L.length) return `<p class="vazio">Nenhum aviso agora.</p>`;
  S.listaAv = L;
  const item = (x, i) => `<div class="av ${x.nivel}"><span class="ic"></span><div><b>${esc(x.titulo)}</b><p>${esc(x.texto)}</p></div>
    <div class="acoes">${x.alvo && (x.alvo.loja || (x.alvo.aba && ehRede())) ? `<button class="mini soft" data-a="av-ir" data-i="${i}">Ver</button>` : ""}<button class="mini link" data-a="av-visto" data-i="${i}">Visto</button></div></div>`;
  if (!agrupar) return `<div class="avisos">${(max ? L.slice(0, max) : L).map(item).join("")}</div>${max && L.length > max ? `<button class="link" data-a="ir" data-h="#/avisos">Ver todos os ${L.length} avisos</button>` : ""}`;
  return [["r", "Urgentes"], ["a", "Atenção"], ["g", "Boas notícias"]].map(([n, t]) => { const g = L.map((x, i) => [x, i]).filter(([x]) => x.nivel === n); return g.length ? `<h3 class="grp ${n}">${t} <small>${g.length}</small></h3><div class="avisos">${g.map(([x, i]) => item(x, i)).join("")}</div>` : ""; }).join("");
}

/* ---------- avisos no celular ---------- */
const pushOk = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
function b64Url(s) { const p = "=".repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, c => c.charCodeAt(0)); }
function faixaAvisos() {
  if (api.modo === "demo" || !window.CONFIG.vapidPublica || !S.perfil) return "";
  if (pushOk() && Notification.permission === "granted" && ls.get("metas-avisos-" + S.perfil.id)) return "";
  if (!pushOk() && !ehIOS) return "";
  const bloq = pushOk() && Notification.permission === "denied";
  return `<div class="faixa">${ICON.sino}<span><b>Avisos neste aparelho</b><small>${bloq ? "Bloqueados no navegador. Libere em Configurações do site → Notificações." : papel() === "loja" ? "Lembrete do fechamento às 20h e resumo às 8h." : "Resumo das metas às 8h, com os urgentes em destaque."}</small></span>${bloq ? "" : `<button class="mini primary" data-a="ativar">Ativar</button>`}</div>`;
}
async function ativarAvisos() {
  if (ehIOS && !instalado()) return modal(`<h2>Primeiro, instale o app</h2><p class="lead" style="margin:0">No iPhone, os avisos só funcionam com o app na tela de início: Safari → <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>. Depois abra pelo ícone e toque em <b>Ativar</b> de novo.</p><button class="btn primary" id="ifec">Entendi</button>`, () => { $("ifec").onclick = fecharModal; });
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { toast("Sem permissão o aparelho não consegue avisar. Dá para liberar depois nas configurações.", 5000); return desenhar(); }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64Url(window.CONFIG.vapidPublica) }));
    const j = sub.toJSON();
    await api.inscreverPush({ endpoint: j.endpoint, chaves: j.keys, aparelho: navigator.userAgent.slice(0, 150) });
    ls.set("metas-avisos-" + S.perfil.id, "1");
    try { await api.testePush(); } catch (e) { }
    toast("Avisos ligados! Mandei um aviso de teste para este aparelho.", 4500); desenhar();
  } catch (e) { erro(e); }
}

/* ---------- painel de uma loja ---------- */
function painelLoja(l, rede) {
  const c = MR.contaLoja(S.dados, l), t = c.tot, sem = !l.meta;
  const cat = (nome, x) => `<div class="cat"><div class="l"><span style="color:var(--fg)">${nome} <span>${R(x.real)} de ${R(x.meta)}</span></span><span class="txt-${x.cor}" style="font-weight:800">${P(x.pct)}</span></div>${barra(x)}</div>`;
  const avL = avisos().filter(x => x.alvo && x.alvo.loja === l.id);
  const comecou = l.diasApp.length || l.ate, meio = S.mes === mesAtual() && l.vend.some(v => v.ativo) && l.pend.length >= 3 && !comecou;
  const saldoBox = rede && S.mes === mesAtual() ? (l.ate
      ? `<div class="saldo-nota">Σ Inclui o saldo de abertura até ${data(l.ate)}. <button class="link" data-a="saldo" data-loja="${l.id}">Ver ou mudar</button></div>`
      : meio ? `<div class="aviso"><b>Começando no meio do mês?</b> Lance o saldo de abertura: quanto cada vendedor já vendeu até ontem. Assim a loja não aparece zerada. <button class="mini primary" data-a="saldo" data-loja="${l.id}" style="margin-top:8px;display:block">Lançar saldo de abertura</button></div>` : "")
    : (l.ate ? `<div class="saldo-nota">Σ Inclui o saldo de abertura até ${data(l.ate)}.</div>` : "");
  return `${saldoBox}<div class="mhero">
    <div class="topo"><span>${esc(l.nome)} · ${l.n} de ${l.N} dias fechados</span>${l.pend.length ? `<span class="cor r">Fechamento pendente${l.pend.length > 1 ? ` (${l.pend.length} dias)` : ""}</span>` : chip(t.cor)}</div>
    <div class="valor"><b>${R(t.real)}</b><span>${sem ? "sem meta cadastrada" : `de ${R(t.meta)}`}</span>${sem ? "" : `<em class="txt-${t.cor}">${P(t.pct)}</em>`}</div>
    ${sem ? "" : `${barra(t)}<div class="legenda"><span>▏Onde deveria estar hoje: ${P(t.ideal)}</span><span>Falta ${R(t.falta)}</span></div>
    <div class="nums">
      <div><small>Precisa vender por dia</small><b>${R(t.diaria)}</b><span>nos ${t.rest} dias que faltam</span></div>
      <div><small>Se continuar assim</small><b class="txt-${corPrev(t.projPct)}">${t.n ? R(t.proj) : "—"}</b><span>${t.n ? `${P(t.projPct)} da meta no fim do mês` : "aparece no 1º dia fechado"}</span></div>
      <div><small>Dias fechados</small><b>${l.n} de ${l.N}</b><span>dias de venda</span></div>
    </div>`}
  </div>
  ${avL.length ? `<section class="sec"><h2>Avisos da loja <small>${avL.length}</small></h2>${listaAvisos(avL, { max: 3 })}</section>` : ""}
  ${sem ? "" : `<section class="sec"><h2>Por categoria</h2><div class="painel cats">${cat("Assistência", c.a)}${cat("Vendas", c.v)}</div></section>`}
  <section class="sec"><h2>Vendedores</h2>${l.vend.length ? `<div class="vends">${l.vend.map(v => cardVend(v, l)).join("")}</div>` : `<p class="vazio">${rede ? `Nenhum vendedor cadastrado. <button class="link" data-a="ir" data-h="#/metas" style="padding:0;color:var(--accent)">Cadastrar em Metas</button>` : "A gestão ainda não cadastrou os vendedores desta loja."}</p>`}</section>
  <section class="sec"><h2>Fechamentos do mês</h2><div class="painel">${diasLoja(l, rede)}</div></section>`;
}

/* ---------- gerente ---------- */
function filaLancar(l) { const hj = S.dados.hj; return [...l.pend, ...(l.hojeVenda && (l.fech.get(hj) || {}).status !== "fechado" ? [hj] : [])]; }
function telaGerente() {
  const l = minhaLoja();
  if (!l) return `<p class="vazio">Loja não encontrada.</p>`;
  let topo = "";
  if (S.mes === mesAtual()) {
    const fila = filaLancar(l), ativos = l.vend.some(v => v.ativo), ult = l.fechados[l.n - 1];
    if (!ativos) topo = `<div class="aviso"><b>Ainda sem vendedores.</b> A gestão precisa cadastrar os vendedores desta loja para o fechamento funcionar.</div>`;
    else if (l.pend.length >= 3 && !l.diasApp.length && !l.ate) topo = `<div class="aviso"><b>A loja está começando a usar agora?</b> Peça à Diretoria para lançar o saldo de abertura (o que já foi vendido no mês). Depois disso, é só fechar o dia de hoje.</div>`;
    else if (fila.length) topo = `<div class="status"><button class="btn primary bigbtn" data-a="ir" data-h="#/lancar">${ICON.ok} ${fila[0] === S.dados.hj ? "Fechar o dia de hoje" : `Lançar ${data(fila[0])}`}</button>
      <p class="${l.pend.length ? "txt-r" : "hint"}" style="margin:0;font-weight:700;text-align:center">${l.pend.length ? `${l.pend.length} dia${l.pend.length > 1 ? "s" : ""} atrasado${l.pend.length > 1 ? "s" : ""} · comece pelo mais antigo` : "Leva 1 minuto: Assistência e Vendas de cada vendedor."}</p></div>`;
    else topo = `<div class="status ok">${ICON.ok}<div><b>Tudo em dia</b><span>${ult ? `Último fechamento: ${data(ult)} · ${R(MR.totDia(l, ult))}` : "Nenhum dia para lançar agora."}</span></div></div>`;
  }
  return `${cabeca(esc(l.nome))}${faixaAvisos()}${topo}${painelLoja(l, false)}`;
}
const chaveR = (l, d) => `metas-rasc-${l}-${d}`;
function rascunho(l, dia) {
  let r = null; try { r = JSON.parse(ls.get(chaveR(l.id, dia)) || "null"); } catch (e) { }
  if (!r) r = Object.fromEntries(l.vend.filter(v => v.ativo || v.val.has(dia)).map(v => { const x = v.val.get(dia); return [v.id, x ? { a: campo(x.a), v: campo(x.v) } : {}]; }));
  return r;
}
function telaLancar() {
  const l = minhaLoja();
  if (S.mes !== mesAtual()) { S.mes = mesAtual(); S.dados = null; return null; }
  const fila = filaLancar(l), dia = fila[0];
  if (!dia) { setTimeout(() => ir("#/"), 0); return ""; }
  const r = rascunho(l, dia), f = l.fech.get(dia), vs = l.vend.filter(v => r[v.id]);
  const tot = vs.reduce((s, v) => s + num(r[v.id].a) + num(r[v.id].v), 0), atras = dia < S.dados.hj;
  S.lanc = { l, dia, r };
  return `${cabeca(atras ? "Fechamento atrasado" : "Fechamento de hoje", { voltar: true, mes: false })}
  <div class="lanc">
    <p class="lead" style="margin:0">${data(dia)} · ${esc(l.nome)}${fila.length > 1 ? ` · <b>dia 1 de ${fila.length} para lançar</b>` : ""}</p>
    ${f && f.status === "aberto" ? `<div class="aviso"><b>A gestão reabriu este dia.</b> Confira os valores e feche de novo.</div>` : ""}
    <div class="tab-lanc"><div class="tl-cab" aria-hidden="true"><span>Vendedor</span><span>Assistência</span><span>Vendas</span></div>
    ${vs.map((v, i) => `<div class="lv"><h3>${esc(v.nome)} <span id="sub-${v.id}">${R(num(r[v.id].a) + num(r[v.id].v))}</span></h3>
      <div class="row"><label class="f"><span>Assistência</span><div class="din"><input id="in-${i}-a" inputmode="decimal" enterkeyhint="next" placeholder="0" autocomplete="off" data-lv="${v.id}" data-k="a" value="${esc(r[v.id].a || "")}"><button type="button" class="tecla-mais" data-a="tecla-mais" data-alvo="in-${i}-a" tabindex="-1" aria-label="Somar outro valor">+</button></div><small class="conta" id="cc-${v.id}-a">${contaTxt(r[v.id].a)}</small></label>
      <label class="f"><span>Vendas</span><div class="din"><input id="in-${i}-v" inputmode="decimal" enterkeyhint="${i === vs.length - 1 ? "done" : "next"}" placeholder="0" autocomplete="off" data-lv="${v.id}" data-k="v" value="${esc(r[v.id].v || "")}"><button type="button" class="tecla-mais" data-a="tecla-mais" data-alvo="in-${i}-v" tabindex="-1" aria-label="Somar outro valor">+</button></div><small class="conta" id="cc-${v.id}-v">${contaTxt(r[v.id].v)}</small></label></div></div>`).join("")}
    </div>
    <p class="hint dica-soma">Dica: digite as anotações com <b>+</b> (ex.: <b>150+200+80</b>) que o app soma. Para tirar um valor, use <b>−</b>.<span class="so-teclado"><br><b>Tab</b> ou <b>Enter</b>: próximo campo · <b>Ctrl+Enter</b>: fechar o dia</span></p>
    <div class="tot-dia"><span>Total do dia</span><span id="totdia">${R(tot)}</span></div>
    <button class="btn primary" data-a="fechar">Fechar o dia</button>
    <p class="hint" style="margin:0;text-align:center">O que você digita fica guardado neste aparelho até fechar.</p>
  </div>`;
}
function confirmarFechar() {
  const { l, dia, r } = S.lanc;
  const vals = l.vend.filter(v => r[v.id]).map(v => ({ v, a: num(r[v.id].a), vv: num(r[v.id].v) }));
  const tot = vals.reduce((s, x) => s + x.a + x.vv, 0), m = S.dados.cfg.fora_media_mult, estranhos = [];
  vals.forEach(({ v, a, vv }) => [["a", a, "Assistência"], ["v", vv, "Vendas"]].forEach(([k, val, nome]) => {
    const outros = l.fechados.filter(x => x !== dia).map(x => (v.val.get(x) || { a: 0, v: 0 })[k]), med = outros.length ? outros.reduce((s, y) => s + y, 0) / outros.length : 0;
    if (outros.length >= 3 && med && val > m * med) estranhos.push(`${esc(v.nome)}: ${R(val)} em ${nome} é ${Math.round(val / med)}× a média (${R(med)}).`);
  }));
  modal(`<h2>Fechar ${data(dia)}?</h2>
    <div class="painel" style="gap:6px">${vals.map(x => `<div class="linha-v"><span>${esc(x.v.nome)}${[r[x.v.id].a, r[x.v.id].v].some(ehConta) ? `<small class="hint" style="display:block">${[ehConta(r[x.v.id].a) ? "Assist. " + esc(r[x.v.id].a) : "", ehConta(r[x.v.id].v) ? "Vendas " + esc(r[x.v.id].v) : ""].filter(Boolean).join(" · ")}</small>` : ""}</span><b>${R(x.a)} + ${R(x.vv)}</b></div>`).join("")}
    <div class="linha-v tot"><span>Total</span><span>${R(tot)}</span></div></div>
    ${!tot ? `<div class="aviso"><b>Tudo zerado.</b> A loja não vendeu nada neste dia?</div>` : ""}
    ${estranhos.length ? `<div class="aviso"><b>Confira esses valores:</b><br>${estranhos.join("<br>")}</div>` : ""}
    <p class="hint" style="margin:0">Depois de fechado, só a gestão pode reabrir.</p>
    <div class="nav"><button class="btn soft" id="mno">Corrigir</button><button class="btn primary" id="mok">${!tot ? "Fechar com zero" : "Fechar o dia"}</button></div>`, () => {
    $("mno").onclick = fecharModal;
    $("mok").onclick = async () => {
      $("mok").disabled = true; $("mok").textContent = "Fechando…";
      try {
        await api.fecharDia(l.id, dia, vals.map(x => ({ vendedor_id: x.v.id, assistencia: x.a, vendas: x.vv })));
        ls.del(chaveR(l.id, dia)); fecharModal(); await carregar();
        const resta = filaLancar(minhaLoja()).length;
        toast(resta ? `${data(dia)} fechado · falta${resta > 1 ? "m" : ""} ${resta}` : `Pronto! ${data(dia)} fechado.`);
        resta ? desenhar() : (history.replaceState(null, "", "#/"), desenhar());
        scrollTo(0, 0);
      } catch (e) { $("mok").disabled = false; $("mok").textContent = "Tentar de novo"; erro(e); }
    };
  });
}

/* ---------- gestão: um dia de uma loja ---------- */
function diaRede(l, dia) {
  const f = l.fech.get(dia), fechado = f && f.status === "fechado", vs = l.vend.filter(v => v.ativo || v.val.has(dia));
  if (!vs.length) return toast("Cadastre os vendedores desta loja primeiro (Metas).", 4000);
  modal(`<h2>${esc(l.nome)} · ${data(dia)}</h2>
    <p class="hint" style="margin:0">${fechado ? "Dia fechado. A mudança fica registrada e o gerente vê o aviso de correção." : f ? "Dia reaberto: o gerente pode lançar de novo, ou você lança aqui." : "Dia ainda não lançado pela loja."}</p>
    ${vs.map(v => { const x = v.val.get(dia); return `<div class="row"><label class="f"><span>${esc(v.nome)} · Assist.</span><div class="din"><input inputmode="decimal" id="ra-${v.id}" value="${x ? campo(x.a) : ""}" placeholder="0"></div></label>
    <label class="f"><span>Vendas</span><div class="din"><input inputmode="decimal" id="rv-${v.id}" value="${x ? campo(x.v) : ""}" placeholder="0"></div></label></div>`; }).join("")}
    <button class="btn primary" id="dsalvar">${fechado ? "Salvar correção" : "Lançar e fechar o dia"}</button>
    ${fechado ? `<button class="btn soft" id="dreabrir">Reabrir para o gerente lançar de novo</button>` : ""}
    <button class="btn soft" id="dcanc">Cancelar</button>`, () => {
    $("dcanc").onclick = fecharModal;
    $("dsalvar").onclick = async () => {
      $("dsalvar").disabled = true;
      try { await api.fecharDia(l.id, dia, vs.map(v => ({ vendedor_id: v.id, assistencia: num($("ra-" + v.id).value), vendas: num($("rv-" + v.id).value) }))); fecharModal(); toast(fechado ? "Correção salva" : "Dia lançado e fechado"); await carregar(); desenhar(); }
      catch (e) { $("dsalvar").disabled = false; erro(e); }
    };
    if ($("dreabrir")) $("dreabrir").onclick = async () => { try { await api.reabrirDia(l.id, dia); fecharModal(); toast("Dia reaberto: o gerente já pode lançar de novo"); await carregar(); desenhar(); } catch (e) { erro(e); } };
  });
}

/* ---------- gestão: saldo de abertura ---------- */
function saldoAbertura(l) {
  const hj = S.dados.hj, primApp = [...l.fech.keys()].sort()[0];
  const opcoes = l.diasV.filter(d => d < hj && (!primApp || d < primApp));
  if (!opcoes.length) return toast("Não há dia anterior disponível para o saldo neste mês.", 4000);
  const vs = l.vend.filter(v => v.ativo || v.saldo), ate = l.ate || opcoes[opcoes.length - 1];
  modal(`<h2>Saldo de abertura · ${esc(l.nome)}</h2>
    <p class="hint" style="margin:0">Quanto cada vendedor já vendeu em ${nomeMes(S.mes).toLowerCase()} até o dia escolhido (o total da planilha). Conta nas contas da meta como dias já fechados; depois disso, a loja fecha dia a dia no app.</p>
    <label class="f"><span>Vendido até o dia</span><select id="sate">${opcoes.map(d => `<option value="${d}" ${d === ate ? "selected" : ""}>${data(d)}</option>`).join("")}</select></label>
    ${primApp ? `<p class="hint" style="margin:0">A loja já lançou no app a partir de ${data(primApp)}: o saldo vai até o dia anterior.</p>` : ""}
    ${vs.map(v => `<div class="row"><label class="f"><span>${esc(v.nome)} · Assist.</span><div class="din"><input inputmode="decimal" id="sa-${v.id}" value="${v.saldo ? campo(v.saldo.a) : ""}" placeholder="0"></div></label>
      <label class="f"><span>Vendas</span><div class="din"><input inputmode="decimal" id="sv-${v.id}" value="${v.saldo ? campo(v.saldo.v) : ""}" placeholder="0"></div></label></div>`).join("")}
    <div class="linha-v tot"><span>Total da loja até o dia</span><span id="stot">R$ 0</span></div>
    <button class="btn primary" id="ssalvar">Salvar saldo</button>
    ${l.ate ? `<button class="btn soft" id="sapagar">Apagar saldo</button>` : ""}
    <button class="btn soft" id="scanc">Cancelar</button>`, () => {
    const tot = () => { $("stot").textContent = R(vs.reduce((s, v) => s + num($("sa-" + v.id).value) + num($("sv-" + v.id).value), 0)); };
    tot(); $("modal").addEventListener("input", tot);
    $("scanc").onclick = fecharModal;
    $("ssalvar").onclick = async () => {
      const vals = vs.map(v => ({ vendedor_id: v.id, assistencia: num($("sa-" + v.id).value), vendas: num($("sv-" + v.id).value) }));
      if (!vals.some(x => x.assistencia || x.vendas)) return toast("Digite pelo menos um valor.");
      $("ssalvar").disabled = true;
      try { await api.salvarSaldo(l.id, S.mes, $("sate").value, vals); fecharModal(); toast("Saldo de abertura salvo"); await carregar(); desenhar(); }
      catch (e) { $("ssalvar").disabled = false; erro(e); }
    };
    if ($("sapagar")) $("sapagar").onclick = () => confirmar("Apagar o saldo de abertura?", "Os dias do saldo voltam a aparecer como pendentes para a loja.", "Apagar", async () => { try { await api.salvarSaldo(l.id, S.mes, l.ate, []); toast("Saldo apagado"); await carregar(); desenhar(); } catch (e) { erro(e); } });
  });
}

/* ---------- gestão: visão da rede ---------- */
function grafico() {
  const D = S.dados, N = D.diasG.length, r = MR.contaRede(D).tot, W = 600, H = 250, ml = 52, mr = 12, mt = 12, mb = 28;
  if (!N || !r.meta) return `<p class="hint">Cadastre as metas para ver o gráfico.</p>`;
  const meta = r.meta, ymax = Math.max(meta, r.proj, r.real) * 1.05, x = i => ml + (W - ml - mr) * i / N, y = v => mt + (H - mt - mb) * (1 - v / ymax);
  const comMeta = D.lojas.filter(l => l.meta);
  const ate = D.diasG.filter(d => d < D.hj || (d === D.hj && comMeta.some(l => (l.fech.get(d) || {}).status === "fechado"))).length;
  const acum = [0]; for (let i = 1; i <= ate; i++) { const d = D.diasG[i - 1], ant = D.diasG[i - 2] || "0000"; acum.push(acum[i - 1] + comMeta.reduce((s, l) => s + l.vend.reduce((t, v) => { let z = 0; v.val.forEach((val, dia) => { if (dia <= d && dia > ant) z += val.a + val.v; }); if (v.saldo && l.ate <= d && l.ate > ant) z += v.saldo.a + v.saldo.v; return t + z; }, 0), 0)); }
  const pts = acum.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ticks = [0, .25, .5, .75, 1].map(f => `<line class="eixo" x1="${ml}" x2="${W - mr}" y1="${y(meta * f)}" y2="${y(meta * f)}"/><text x="${ml - 6}" y="${y(meta * f) + 4}" text-anchor="end">${Math.round(meta * f / 1000)}k</text>`).join("");
  const xl = [1, ate, N].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map(i => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${+D.diasG[i - 1].slice(8)}/${D.diasG[i - 1].slice(5, 7)}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Realizado da rede ${R(acum[ate])} contra onde deveria estar; previsão ${R(r.proj)}">${ticks}${xl}
    <polygon class="area" points="${x(0)},${y(0)} ${pts} ${x(ate)},${y(0)}"/><line class="ideal" x1="${x(0)}" y1="${y(0)}" x2="${x(N)}" y2="${y(meta)}"/>
    ${ate ? `<line class="proj" x1="${x(ate)}" y1="${y(acum[ate])}" x2="${x(N)}" y2="${y(r.proj)}"/><circle cx="${x(ate)}" cy="${y(acum[ate])}" r="5" fill="var(--accent)"/>` : ""}
    <polyline class="real" points="${pts}"/></svg>
  <div class="leg-dias"><span style="--c:var(--accent)">Realizado</span><span style="--c:var(--muted)">Onde deveria estar (tracejado)</span><span style="--c:var(--accent-soft)">Previsão (pontilhado)</span></div>`;
}
function telaRede() {
  const D = S.dados, r = MR.contaRede(D), t = r.tot;
  if (!D.lojas.some(l => l.meta)) return `${cabeca("Metas da rede")}<div class="vazio">Nenhuma meta cadastrada em ${nomeMes(S.mes).toLowerCase()}.<br><button class="btn primary" data-a="ir" data-h="#/metas" style="margin-top:14px;width:auto">Cadastrar metas e vendedores</button></div>`;
  const pend = D.lojas.filter(l => l.pend.length);
  S.rank = D.lojas.flatMap(l => l.vend.filter(v => v.meta && v.ativo).map(v => ({ l, v, c: MR.contaVend(D, v, l).tot }))).sort((a, b) => b.c.pct - a.c.pct);
  return `${cabeca("Metas da rede")}${faixaAvisos()}
  <div class="kpis2">
    <div><small>Realizado</small><b>${R(t.real)}</b><span>de ${R(t.meta)}</span></div>
    <div><small>% da meta</small><b class="txt-${t.cor}">${P(t.pct)}</b><span>deveria estar em ${P(t.ideal)}</span></div>
    <div><small>Falta</small><b>${R(t.falta)}</b><span>em ${t.rest} dias de venda</span></div>
    <div><small>Precisa por dia</small><b>${R(t.diaria)}</b><span>a rede toda</span></div>
    <div><small>Se continuar assim</small><b class="txt-${corPrev(t.projPct)}">${P(t.projPct)}</b><span>${R(t.proj)}</span></div>
  </div>
  <div class="painel" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:10px">${[["Assistência", r.a], ["Vendas", r.v]].map(([nome, x]) => `<div class="cat"><div class="l"><span style="color:var(--fg)">${nome} <span>${R(x.real)} de ${R(x.meta)}</span></span><span class="txt-${x.cor}" style="font-weight:800">${P(x.pct)}</span></div>${barra(x)}</div>`).join("")}</div>
  ${pend.length ? `<div class="aviso" style="margin-top:10px"><b>Fechamento pendente:</b> ${pend.map(l => `${esc(l.nome)} (${l.pend.length} ${l.pend.length > 1 ? "dias" : "dia"})`).join(", ")}. Os números dessas lojas vão até o último dia fechado. Pendente não quer dizer que não vendeu.</div>` : ""}
  <section class="sec"><h2>Lojas <small>toque para abrir</small></h2><div class="lojas">${D.lojas.map(l => {
    const c = MR.contaLoja(D, l).tot;
    return `<button class="mloja ${l.pend.length ? "pend" : c.cor}" data-a="ir" data-h="#/loja/${l.id}"><div class="cab"><h3>${esc(l.nome)}</h3>${l.pend.length ? `<span class="cor r">Pendente</span>` : chip(c.cor)}</div>
      ${l.meta ? `<span class="pct txt-${c.cor}">${P(c.pct)}</span>${barra(c, "fina")}<small>${R(c.real)} de ${R(c.meta)}</small><small>${R(c.diaria)}/dia · previsão ${c.n ? P(c.projPct) : "—"}</small>` : `<small>${R(c.real)} · sem meta</small>`}</button>`;
  }).join("")}</div></section>
  <section class="sec dois">
    <div class="painel graf"><h3>Realizado × onde deveria estar</h3>${grafico()}</div>
    <div class="painel"><h3>Ranking de vendedores</h3>${S.rank.length ? `<ol class="rank">${S.rank.map((x, i) => `<li data-a="rank" data-i="${i}"><span>${esc(x.v.nome)} <small>${esc(x.l.nome)}</small></span><b class="txt-${x.c.cor}">${P(x.c.pct)}</b><i class="ponto ${x.c.cor}"></i></li>`).join("")}</ol>` : `<p class="hint">Sem vendedores com meta.</p>`}</div>
  </section>
  <section class="sec"><button class="btn soft" data-a="relatorio">${ICON.doc} Relatório de ${nomeMes(S.mes).toLowerCase()}: tabela e planilha</button></section>`;
}
function relatorio() {
  const rel = MR.relatorio(S.dados), r = rel.rede, pct = x => x.meta ? P(x.pct) : "—";
  const lin = x => `<tr class="${x.tipo}"><td>${esc(x.nome)}</td><td>${R(x.realA)}<br><small class="hint">${x.metaA ? "de " + R(x.metaA) : ""}</small></td><td>${R(x.realV)}<br><small class="hint">${x.metaV ? "de " + R(x.metaV) : ""}</small></td><td>${R(x.real)}<br><small class="hint">${x.meta ? "de " + R(x.meta) : "sem meta"}</small></td><td><b>${pct(x)}</b></td></tr>`;
  modal(`<h2>Relatório · ${nomeMes(rel.mes)}</h2>
    <div class="kpis2" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div><small>Rede</small><b>${pct(r)}</b><span>${R(r.real)} de ${R(r.meta)}</span></div><div><small>Assistência</small><b>${R(r.realA)}</b><span>de ${R(r.metaA)}</span></div><div><small>Vendas</small><b>${R(r.realV)}</b><span>de ${R(r.metaV)}</span></div></div>
    <div class="rolar"><table class="tab-metas rel"><thead><tr><th></th><th>Assistência</th><th>Vendas</th><th>Total</th><th>%</th></tr></thead><tbody>${rel.linhas.map(lin).join("")}</tbody></table></div>
    <p class="hint" style="margin:0">Números de agora: se um dia for corrigido depois, o relatório muda junto.</p>
    <div class="nav"><button class="btn soft" id="rcsv">Baixar planilha</button><button class="btn soft" id="rimp">Imprimir</button></div>
    <button class="btn primary" id="rfec">Fechar</button>`, () => {
    $("rfec").onclick = fecharModal; $("rimp").onclick = () => print();
    $("rcsv").onclick = () => {
      const n = v => String(Math.round(v * 100) / 100).replace(".", ",");
      const cab = ["Loja", "Nome", "Tipo", "Assistência meta", "Assistência realizado", "Vendas meta", "Vendas realizado", "Meta total", "Realizado total", "% da meta", "Dias fechados"];
      const rows = rel.linhas.map(x => [x.loja, x.nome, x.tipo === "loja" ? "Loja" : "Vendedor", n(x.metaA), n(x.realA), n(x.metaV), n(x.realV), n(x.meta), n(x.real), x.meta ? n(x.pct * 100) : "", x.dias]);
      rows.push(["Rede", "Rede", "Total", n(r.metaA), n(r.realA), n(r.metaV), n(r.realV), n(r.meta), n(r.real), r.meta ? n(r.pct * 100) : "", ""]);
      const csv = "﻿" + [cab, ...rows].map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `metas-${rel.mes.slice(0, 7)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
  }, "box-rel");
}

/* ---------- gestão: metas em lote ---------- */
const sujo = () => !!S.edicao && Object.keys(S.edicao.lojas).length + Object.keys(S.edicao.vend).length + Object.keys(S.edicao.nomes).length > 0;
const nSujo = () => S.edicao ? Object.keys(S.edicao.lojas).length + Object.keys(S.edicao.vend).length + Object.keys(S.edicao.nomes).length : 0;
const txtSujo = () => { const n = nSujo(); return `${n} ${n > 1 ? "alterações" : "alteração"} sem salvar`; };
const metaL = l => S.edicao.lojas[l.id] || l.meta || { a: 0, v: 0 };
const metaV = v => v.id in S.edicao.vend ? S.edicao.vend[v.id] : v.meta;
const nomeV = v => S.edicao.nomes[v.id] ?? v.nome;
function resumoLoja(l) {
  const ml = metaL(l), at = l.vend.filter(v => v.ativo), sa = at.reduce((s, v) => s + ((metaV(v) || {}).a || 0), 0), sv = at.reduce((s, v) => s + ((metaV(v) || {}).v || 0), 0);
  const ok = !ml.a && !ml.v || (sa === ml.a && sv === ml.v);
  return `<span>Meta da loja: <b>${R(ml.a + ml.v)}</b></span>${ok ? (ml.a || ml.v ? `<span class="txt-g">✓ Vendedores somam a meta da loja</span>` : "") : `<span class="txt-a">Vendedores somam Assist. ${R(sa)} · Vendas ${R(sv)}</span>`}`;
}
function telaMetas() {
  const D = S.dados;
  if (!S.edicao || S.edicao.mes !== S.mes) S.edicao = { mes: S.mes, lojas: {}, vend: {}, nomes: {} };
  const cfgDesc = new Map((D.raw.config || []).map(c => [c.chave, c.descricao])), pad = MR.dow(D.dias[0]);
  const cartoes = D.lojas.map(l => {
    const ml = metaL(l), at = l.vend.filter(v => v.ativo);
    return `<div class="mcard" id="mc-${l.id}">
      <div class="mc-cab"><h3>${esc(l.nome)}</h3><div class="mc-res" id="res-${l.id}">${resumoLoja(l)}</div></div>
      <div class="mc-linha loja"><span>Meta da loja</span><div class="din"><input inputmode="decimal" aria-label="Assistência da ${esc(l.nome)}" placeholder="Assistência" data-ml="${l.id}" data-k="a" value="${campo(ml.a)}"></div><div class="din"><input inputmode="decimal" aria-label="Vendas da ${esc(l.nome)}" placeholder="Vendas" data-ml="${l.id}" data-k="v" value="${campo(ml.v)}"></div><span></span></div>
      <div class="mc-titulos"><span>Vendedor</span><span>Assistência</span><span>Vendas</span><span></span></div>
      ${at.map(v => { const m = metaV(v); return `<div class="mc-linha"><input data-vn="${v.id}" value="${esc(nomeV(v))}" aria-label="Nome do vendedor"><div class="din"><input inputmode="decimal" placeholder="sem meta" data-mv="${v.id}" data-k="a" value="${m ? campo(m.a) : ""}"></div><div class="din"><input inputmode="decimal" placeholder="sem meta" data-mv="${v.id}" data-k="v" value="${m ? campo(m.v) : ""}"></div><button class="link" data-a="sair-vend" data-v="${v.id}" title="Saiu da loja" aria-label="Tirar ${esc(v.nome)} da lista">×</button></div>`; }).join("")}
      <div class="mc-acoes">${S.mes === mesAtual() && at.length ? `<button class="mini soft" data-a="saldo" data-loja="${l.id}">Σ Saldo de abertura${l.ate ? ` (até ${l.ate.slice(8)}/${l.ate.slice(5, 7)})` : ""}</button>` : ""}${at.length ? `<button class="mini soft" data-a="dividir" data-loja="${l.id}">Dividir a meta entre ${at.length} vendedor${at.length > 1 ? "es" : ""}</button>` : ""}
        <span class="novo"><input id="novo-${l.id}" placeholder="Vendedor novo"><button class="mini soft" data-a="novo-vend" data-loja="${l.id}">${ICON.mais}</button></span></div>
    </div>`;
  }).join("");
  const lims = Object.keys(MR.CFG);
  return `${cabeca("Metas e vendedores")}
  <p class="hint" style="margin:0 0 10px">Digite as metas e toque em <b>Salvar</b> no fim. Vendedor sem valor fica "sem meta". O × tira quem saiu (o que já vendeu continua no histórico).</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><button class="mini soft" data-a="copiar">Copiar metas de ${nomeMes(MR.mesMais(S.mes, -1)).split(" ")[0].toLowerCase()}</button></div>
  <div class="mcards">${cartoes}</div>
  <div class="savebar" id="savebar" ${sujo() ? "" : "hidden"}><span id="nsujo">${txtSujo()}</span><button class="mini soft" data-a="descartar">Descartar</button><button class="mini primary" data-a="salvar">Salvar</button></div>
  <section class="sec"><h2>Dias de venda <small>${D.diasG.length} dias · toque para abrir/fechar um dia na rede</small></h2>
  <div class="painel"><div class="cal">${MR.SEM.map(s => `<span class="ds">${s}</span>`).join("")}${"<span></span>".repeat(pad)}${D.dias.map(d => { const ab = D.calG.has(d) ? D.calG.get(d) : MR.dow(d) !== 0; return `<button class="${ab ? "on" : ""}" data-a="cal" data-dia="${d}" title="${ab ? "Loja abre" : "Fechado"}">${+d.slice(8)}</button>`; }).join("")}</div>
  <p class="hint" style="margin:0">Sem marcação, vale segunda a sábado. A meta por dia e a previsão usam só os dias abertos.</p></div></section>
  <section class="sec"><details class="painel"><summary><b>Limites dos avisos</b> <small class="hint">(ajuste fino)</small></summary><div class="lim" style="margin-top:10px">${lims.map(k => `<span>${esc(cfgDesc.get(k) || k)}</span><input inputmode="decimal" data-cfg="${k}" value="${String(D.cfg[k]).replace(".", ",")}">`).join("")}</div></details></section>
  ${papel() === "admin" ? `<section class="sec"><details class="painel" id="acessos"><summary><b>Acessos da Gestão</b> <small class="hint">(só Admin)</small></summary><div id="acessos-corpo" style="margin-top:10px"><p class="hint">Carregando…</p></div></details></section>` : ""}`;
}
function atualizarResumo(lojaId) {
  const el = $("res-" + lojaId); if (el) el.innerHTML = resumoLoja(lojaPor(lojaId));
  $("savebar").hidden = !sujo(); $("nsujo").textContent = txtSujo();
}
async function salvarMetas() {
  const e = S.edicao;
  const lojas = Object.entries(e.lojas).map(([loja_id, m]) => ({ loja_id, a: m.a, v: m.v }));
  const vend = Object.entries(e.vend).map(([vendedor_id, m]) => ({ vendedor_id, m: m && (m.a || m.v) ? m : null }));
  const nomes = Object.entries(e.nomes).filter(([, n]) => n.trim()).map(([id, nome]) => ({ id, nome: nome.trim() }));
  await api.salvarMetasLote(S.mes, lojas, vend, nomes);
  S.edicao = null; await carregar(); toast("Metas salvas"); desenhar();
}
async function acessos() {
  const corpo = $("acessos-corpo"); if (!corpo) return;
  try {
    const U = (await api.usuarios("listar")).filter(u => u.papel === "gestao");
    corpo.innerHTML = `${U.length ? U.map(u => `<div class="linha-v"><span><b>${esc(u.nome)}</b> <small class="hint">${esc(u.usuario)}${u.ativo ? "" : " · desativado"}</small></span><button class="mini soft" data-a="ativo" data-id="${u.id}" data-ativo="${u.ativo ? 0 : 1}">${u.ativo ? "Desativar" : "Reativar"}</button></div>`).join("") : `<p class="hint" style="margin:0">Nenhum acesso de Gestão ainda.</p>`}
      <form id="fdona" class="row" style="margin-top:12px"><label class="f"><span>Usuário</span><input id="dusu" autocapitalize="none" placeholder="ex.: gestao" required></label><label class="f"><span>Nome</span><input id="dnome" placeholder="Nome" value="Diretoria" required></label>
      <label class="f"><span>Senha (mín. 6)</span><input id="dsen" type="password" minlength="6" autocomplete="new-password" required></label><span style="align-self:end"><button class="btn primary">Criar acesso</button></span></form>
      <p class="hint" style="margin:6px 0 0">Os gerentes entram com o login da própria loja (o mesmo do Portal).</p>`;
    $("fdona").onsubmit = async ev => {
      ev.preventDefault();
      try { await api.usuarios("criar", { papel: "gestao", loja_id: null, usuario: $("dusu").value.trim().toLowerCase(), nome: $("dnome").value.trim(), senha: $("dsen").value }); toast("Acesso criado"); acessos(); }
      catch (e) { erro(e); }
    };
  } catch (e) { corpo.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

/* ---------- avisos ---------- */
function telaAvisos() {
  const L = avisos();
  return `${cabeca("Avisos", { voltar: true })}
  <p class="hint" style="margin:0 0 10px">Do mais importante para o menos. ${ehRede() ? "O gerente vê os avisos da loja dele." : "Avisos da sua loja."} "Visto" tira da lista; volta só se piorar ou depois de ${S.dados.cfg.repetir_dias} dias.</p>
  ${L.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px"><button class="mini soft" data-a="todos-vistos">Marcar todos como vistos</button></div>` : ""}
  ${listaAvisos(L, { agrupar: true })}
  ${S.dados.vistos.size ? `<button class="link" data-a="desver" style="margin-top:10px">Mostrar de novo os ${S.dados.vistos.size} vistos</button>` : ""}`;
}

/* ---------- desenho geral ---------- */
function desenhar() {
  if (!S.perfil) return telaLogin();
  $("top").hidden = false;
  $("quem").textContent = S.perfil.nome;
  $("sub").innerHTML = `${ehRede() ? "Metas da rede" : "Metas da loja"}${api.modo === "demo" ? ` <span class="demo-tag">demo</span>` : ""}`;
  const alvo = $("app"); alvo.className = "wrap" + (ehRede() ? " wide" : "");
  if (!S.dados || S.dados.mes !== S.mes) {
    alvo.innerHTML = `<p class="carregando">Carregando…</p>`;
    if (!S.carregando) carregar().then(desenhar).catch(e => { alvo.innerHTML = `<div class="vazio">Não consegui carregar. ${esc(e.message)}<br><button class="btn soft" data-a="tentar" style="margin-top:12px;width:auto">Tentar de novo</button></div>`; });
    return;
  }
  const L = avisos(), urg = L.some(x => x.nivel === "r");
  $("sino").innerHTML = ICON.sino + (L.length ? `<span class="${urg ? "urg" : ""}">${L.length}</span>` : "");
  const { nome, arg } = rota();
  if (nome === "relatorio") { if (ehRede()) { S.mes = MR.mesMais(mesAtual(), -1); S.abrirRel = true; } history.replaceState(null, "", "#/"); return desenhar(); }
  let html;
  if (nome === "avisos") html = telaAvisos();
  else if (ehRede()) html = nome === "metas" ? telaMetas() : nome === "loja" && lojaPor(arg) ? `${cabeca(esc(lojaPor(arg).nome), { voltar: true })}${painelLoja(lojaPor(arg), true)}` : telaRede();
  else html = nome === "lancar" ? telaLancar() : telaGerente();
  if (html === null) return desenhar();
  const abas = ehRede() ? [["#/", "Visão geral", nome === "inicio" || nome === "loja"], ["#/metas", "Metas", nome === "metas"], ["#/avisos", "Avisos", nome === "avisos"]] : null;
  alvo.innerHTML = `<div class="mt">${abas ? `<nav class="tabs">${abas.map(([h, t, on]) => `<button class="${on ? "on" : ""}" data-a="ir" data-h="${h}">${t}</button>`).join("")}</nav>` : ""}${html}</div>`;
  if (nome === "metas" && $("acessos")) $("acessos").addEventListener("toggle", e => { if (e.target.open) acessos(); });
  if (S.foco) { const el = $(S.foco); S.foco = null; if (el) setTimeout(() => el.scrollIntoView({ block: "center" }), 0); }
  if (nome === "lancar" && matchMedia("(pointer:fine)").matches && !document.activeElement.matches("input")) { const c = [...document.querySelectorAll("[data-lv]")]; (c.find(x => !x.value) || c[0] || { focus() { } }).focus(); }
  mostrarInstalar();
  if (S.abrirRel && ehRede() && S.dados.mes === S.mes) { S.abrirRel = false; relatorio(); }
}

/* ---------- cliques ---------- */
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-a]"); if (!b || b.closest("#modal") && !b.dataset.a) return;
  const a = b.dataset.a;
  try {
    if (a === "ir") return ir(b.dataset.h);
    if (a === "voltar") return voltar();
    if (a === "tentar") return desenhar();
    if (a === "mes") { if (sujo() && !confirm("Há metas sem salvar. Trocar de mês e descartar?")) return; S.edicao = null; S.mes = MR.mesMais(S.mes, +b.dataset.k); return desenhar(); }
    if (a === "mes-atual") { S.mes = mesAtual(); return desenhar(); }
    if (a === "rank") { const x = S.rank[+b.dataset.i]; S.foco = "v-" + x.v.id; return ir("#/loja/" + x.l.id); }
    if (a === "av-ir") {
      const x = S.listaAv[+b.dataset.i], al = x.alvo;
      if (al.mes) { S.mes = al.mes; }
      if (al.vend) S.foco = "v-" + al.vend;
      return ir(al.aba === "metas" ? "#/metas" : ehRede() && al.loja ? "#/loja/" + al.loja : "#/");
    }
    if (a === "av-visto") { const x = S.listaAv[+b.dataset.i]; await api.marcarVistos([x]); S.dados.vistos.set(x.chave, { chave: x.chave, gravidade: x.g, visto_em: new Date().toISOString() }); S.cache.d = null; return desenhar(); }
    if (a === "todos-vistos") { const L = avisos(); await api.marcarVistos(L); L.forEach(x => S.dados.vistos.set(x.chave, { chave: x.chave, gravidade: x.g, visto_em: new Date().toISOString() })); S.cache.d = null; toast("Todos marcados como vistos"); return desenhar(); }
    if (a === "desver") { await api.limparVistos(); await carregar(); return desenhar(); }
    if (a === "dia") return diaRede(lojaPor(rota().arg), b.dataset.dia);
    if (a === "saldo") return saldoAbertura(lojaPor(b.dataset.loja));
    if (a === "fechar") return confirmarFechar();
    if (a === "tecla-mais") { const i = $(b.dataset.alvo); if (i.value && !/[+-]$/.test(i.value)) i.value += "+"; i.focus(); i.dispatchEvent(new Event("input", { bubbles: true })); return; }
    if (a === "relatorio") return relatorio();
    if (a === "ativar") return ativarAvisos();
    if (a === "copiar") { const n = await api.copiarMetas(MR.mesMais(S.mes, -1), S.mes); toast(n ? `${n} metas copiadas` : "Nada para copiar (ou já estava tudo cadastrado)"); S.edicao = null; await carregar(); return desenhar(); }
    if (a === "cal") { const d = b.dataset.dia, D = S.dados, ab = D.calG.has(d) ? D.calG.get(d) : MR.dow(d) !== 0; await api.salvarCalendario(d, !ab); await carregar(); return desenhar(); }
    if (a === "salvar") { b.disabled = true; try { await salvarMetas(); } finally { b.disabled = false; } return; }
    if (a === "descartar") { S.edicao = null; return desenhar(); }
    if (a === "dividir") {
      const l = lojaPor(b.dataset.loja), at = l.vend.filter(v => v.ativo), ml = metaL(l);
      if (!ml.a && !ml.v) return toast("Digite primeiro a meta da loja.");
      at.forEach((v, i) => { const ult = i === at.length - 1; S.edicao.vend[v.id] = { a: ult ? ml.a - r10(ml.a / at.length) * (at.length - 1) : r10(ml.a / at.length), v: ult ? ml.v - r10(ml.v / at.length) * (at.length - 1) : r10(ml.v / at.length) }; });
      toast("Meta dividida. Confira e toque em Salvar."); return desenhar();
    }
    if (a === "novo-vend") { const i = $("novo-" + b.dataset.loja), nome = i.value.trim(); if (!nome) return i.focus(); await api.salvarVendedor({ loja_id: b.dataset.loja, nome, ordem: lojaPor(b.dataset.loja).vend.length }); toast(`${nome} cadastrado`); await carregar(); return desenhar(); }
    if (a === "sair-vend") {
      const v = S.dados.lojas.flatMap(l => l.vend).find(x => x.id === b.dataset.v);
      return confirmar(`${esc(v.nome)} saiu da loja?`, "Some da lista de lançamento e das metas. O que já vendeu continua no histórico.", "Tirar da lista", async () => { try { await api.salvarVendedor({ id: v.id, ativo: false }); delete S.edicao.vend[v.id]; await carregar(); desenhar(); } catch (er) { erro(er); } });
    }
    if (a === "ativo") { await api.usuarios("ativo", { id: b.dataset.id, ativo: b.dataset.ativo === "1" }); return acessos(); }
  } catch (er) { erro(er); }
});
$("sino").onclick = () => ir("#/avisos");
$("sair").onclick = async () => { if (sujo() && !confirm("Há metas sem salvar. Sair mesmo assim?")) return; await api.sair(); S.perfil = null; S.dados = null; S.edicao = null; history.replaceState(null, "", location.pathname + location.search); desenhar(); };

/* ---------- digitação ---------- */
document.addEventListener("input", e => {
  const i = e.target, d = i.dataset || {};
  if (d.lv && S.lanc) { // lançar o dia: guarda o rascunho a cada tecla
    const { l, dia, r } = S.lanc, x = (r[d.lv] ||= {}); x[d.k] = i.value;
    ls.set(chaveR(l.id, dia), JSON.stringify(r));
    $("sub-" + d.lv).textContent = R(num(x.a) + num(x.v));
    const cc = $(`cc-${d.lv}-${d.k}`); if (cc) cc.textContent = contaTxt(i.value);
    $("totdia").textContent = R(Object.values(r).reduce((s, y) => s + num(y.a) + num(y.v), 0));
  }
  if (d.ml) { const l = lojaPor(d.ml); S.edicao.lojas[l.id] = { ...metaL(l), [d.k]: num(i.value) }; atualizarResumo(l.id); }
  if (d.mv) { const v = S.dados.lojas.flatMap(l => l.vend).find(x => x.id === d.mv), m = { ...(metaV(v) || { a: 0, v: 0 }), [d.k]: num(i.value) }; S.edicao.vend[v.id] = m.a || m.v ? m : null; atualizarResumo(S.dados.lojas.find(l => l.vend.includes(v)).id); }
  if (d.vn) { S.edicao.nomes[d.vn] = i.value; atualizarResumo(S.dados.lojas.find(l => l.vend.some(v => v.id === d.vn)).id); }
});
document.addEventListener("change", async e => {
  const i = e.target; if (!i.dataset || !i.dataset.cfg) return;
  const val = Number(String(i.value).replace(",", ".")); if (!isFinite(val) || val < 0) { toast("Valor inválido"); return desenhar(); }
  try { await api.salvarConfig(i.dataset.cfg, val); toast("Limite salvo"); await carregar(); } catch (er) { erro(er); }
});
// Enter passa para o próximo campo; no último, abre o "Fechar o dia"
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && rota().nome === "lancar" && $("modal").hidden && S.lanc) { e.preventDefault(); return confirmarFechar(); }
  if (e.key !== "Enter" || !e.target.dataset || !e.target.dataset.lv || !$("modal").hidden) return;
  e.preventDefault();
  const c = [...document.querySelectorAll("[data-lv]")], i = c.indexOf(e.target);
  c[i + 1] ? c[i + 1].focus() : confirmarFechar();
});
// janela aberta: Enter confirma (o botão principal), Esc volta. Não age no mesmo Enter que abriu a janela.
document.addEventListener("keydown", e => {
  if ($("modal").hidden || e.defaultPrevented) return;
  if (e.key === "Escape") { e.preventDefault(); return fecharModal(); }
  const ok = $("mok"); if (e.key !== "Enter" || !ok || ok.disabled) return;
  const foco = document.activeElement; if (foco && (foco.tagName === "BUTTON" || foco.tagName === "TEXTAREA" || $("modal").contains(foco) && foco.tagName === "INPUT")) return;
  e.preventDefault(); ok.click();
});

/* ---------- instalar o app ---------- */
let pedidoInstalar = null;
function mostrarInstalar() { document.querySelectorAll(".instalar").forEach(b => b.hidden = instalado() || !(pedidoInstalar || ehIOS)); }
addEventListener("beforeinstallprompt", e => { e.preventDefault(); pedidoInstalar = e; mostrarInstalar(); });
document.addEventListener("click", async e => {
  if (!e.target.closest(".instalar")) return;
  if (pedidoInstalar) { pedidoInstalar.prompt(); try { await pedidoInstalar.userChoice; } catch (er) { } pedidoInstalar = null; return mostrarInstalar(); }
  if (ehIOS) modal(`<h2>Instalar no iPhone</h2><ol class="passos-ios"><li>Abra no <b>Safari</b>.</li><li>Toque em <b>Compartilhar</b> (quadrado com seta).</li><li>Toque em <b>Adicionar à Tela de Início</b>.</li></ol><button class="btn primary" id="ifec">Entendi</button>`, () => { $("ifec").onclick = fecharModal; });
});

/* ---------- partida ---------- */
async function iniciar() {
  S.lojas = await api.lojas(); S.dados = null; S.edicao = null;
  desenhar();
}
api.ouvir(async () => { if (!S.perfil || S.carregando) return; try { await carregar(); if (!$("modal").hidden || document.activeElement && document.activeElement.matches("input")) return; desenhar(); } catch (e) { } });
(async () => {
  try { S.perfil = await api.sessao(); } catch (e) { S.perfil = null; }
  if (S.perfil) await iniciar(); else desenhar();
})();
async function conferirVersao() {
  try {
    const { v } = await (await fetch("versao.json?x=" + Date.now(), { cache: "no-store" })).json();
    if (!v || !window.VERSAO || v === window.VERSAO) return;
    if (sujo() || !$("modal").hidden || rota().nome === "lancar" || (document.activeElement && document.activeElement.matches("input"))) return;
    if (ls.get("metas-versao-tentada") === v) return;
    ls.set("metas-versao-tentada", v);
    const q = new URLSearchParams(location.search); q.set("v", v);
    location.replace(location.pathname + "?" + q.toString() + location.hash);
  } catch (e) { }
}
conferirVersao();
document.addEventListener("visibilitychange", () => { if (!document.hidden) conferirVersao(); });
setInterval(conferirVersao, 20 * 60 * 1000);
if ("serviceWorker" in navigator && api.modo !== "demo") addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(e => console.warn("sw", e)));
