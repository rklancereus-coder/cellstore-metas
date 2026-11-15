/* Acesso aos dados. Duas versões com as mesmas funções:
   - Supabase (de verdade): o banco decide o que cada papel vê e grava (banco/banco.sql);
   - demonstração (?demo): tudo no próprio aparelho, com dados de exemplo e as mesmas regras. */
import * as MR from "./regras.js?v=202611151221";

export const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };

export function criarApi(cfg) {
  const demo = new URLSearchParams(location.search).has("demo") || !cfg.supabaseUrl;
  return demo ? apiDemo() : apiSupabase(cfg);
}

/* ===================== SUPABASE ===================== */
function apiSupabase(cfg) {
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "metas-sessao" } });
  const traduzir = e => {
    const m = String(e && e.message || e);
    if (/Invalid login credentials/i.test(m)) return new Error("Usuário ou senha incorretos.");
    if (/JWT|session/i.test(m)) return new Error("Sua sessão expirou. Entre de novo.");
    if (/row-level security|permission denied/i.test(m)) return new Error("Você não tem permissão para isso.");
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return new Error("Sem conexão com a internet. Os valores digitados continuam guardados: tente de novo.");
    return new Error(m);
  };
  const ok = ({ data, error }) => { if (error) throw traduzir(error); return data; };
  let perfilId = null;
  async function perfilAtual() {
    const { data } = await sb.auth.getUser();
    if (!data || !data.user) return null;
    const p = ok(await sb.from("perfis").select("id, usuario, nome, papel, loja_id, ativo").eq("id", data.user.id).maybeSingle());
    if (!p || !p.ativo || !["loja", "gestao", "admin"].includes(p.papel)) { await sb.auth.signOut(); return null; }
    perfilId = p.id; return p;
  }
  async function funcao(nome, corpo) {
    const { data, error } = await sb.functions.invoke(nome, { body: corpo });
    if (error) { let msg = error.message; try { const j = await error.context.json(); if (j && j.erro) msg = j.erro; } catch (e) { } throw new Error(msg); }
    if (data && data.erro) throw new Error(data.erro);
    return data;
  }
  return {
    modo: "supabase",
    sessao: perfilAtual,
    async logins() { return ok(await sb.rpc("logins_ativos")).filter(l => ["loja", "gestao", "admin"].includes(l.papel)); },
    async entrar(usuario, senha) {
      const u = String(usuario).trim().toLowerCase();
      try { ok(await sb.auth.signInWithPassword({ email: u.includes("@") ? u : `${u}@${cfg.dominioLogin}`, password: senha })); }
      catch (e) { throw e; }
      const p = await perfilAtual();
      if (!p) throw new Error("Este acesso não usa o app de metas (só lojas, Gestão e Admin).");
      return p;
    },
    async sair() { await sb.auth.signOut(); },
    async lojas() { return ok(await sb.from("lojas").select("id, nome, ativa, ordem, online").order("ordem").order("nome")); },
    async metasMes(mes) {
      const fim = MR.addDias(MR.mesMais(mes, 1), -1);
      const r = await Promise.all([
        sb.from("metas_vendedores").select("*"),
        sb.from("metas_loja").select("*").eq("mes", mes),
        sb.from("metas_vendedor").select("*").eq("mes", mes),
        sb.from("metas_calendario").select("*").gte("dia", mes).lte("dia", fim),
        sb.from("metas_calendario_loja").select("*").gte("dia", mes).lte("dia", fim),
        sb.from("metas_fechamentos").select("id, loja_id, dia, status, fechado_em, reaberto_em").gte("dia", mes).lte("dia", fim),
        sb.from("metas_lancamentos").select("loja_id, dia, status, vendedor_id, assistencia, vendas").gte("dia", mes).lte("dia", fim).limit(10000),
        sb.from("metas_correcoes").select("fechamento_id, vendedor_id, campo, antes, depois, em, metas_fechamentos!inner(dia)").gte("metas_fechamentos.dia", mes).lte("metas_fechamentos.dia", fim),
        sb.from("metas_config").select("*"),
        sb.from("metas_vistos").select("chave, gravidade, visto_em"),
        sb.from("metas_loja").select("loja_id", { count: "exact", head: true }).eq("mes", MR.mesMais(mes, 1)),
      ]);
      const [vendedores, metasLoja, metasVend, cal, calLoja, fech, lanc, corr, config, vistos] = r.slice(0, 10).map(ok);
      return { vendedores, metasLoja, metasVend, cal, calLoja, fech, lanc, corr: corr.map(({ metas_fechamentos, ...c }) => c), config, vistos, proximoTemMetas: (r[10].count || 0) > 0 };
    },
    async fecharDia(loja, dia, valores) { return ok(await sb.rpc("metas_fechar_dia", { p_loja: loja, p_dia: dia, p_valores: valores })); },
    async reabrirDia(loja, dia) { ok(await sb.rpc("metas_reabrir_dia", { p_loja: loja, p_dia: dia })); },
    async copiarMetas(de, para) { return ok(await sb.rpc("metas_copiar", { p_de: de, p_para: para })); },
    async salvarVendedor(v) { const { id, ...d } = v; id ? ok(await sb.from("metas_vendedores").update(d).eq("id", id)) : ok(await sb.from("metas_vendedores").insert(d)); },
    // metas em lote: lojas [{loja_id,a,v}], vend [{vendedor_id, m:{a,v}|null}], nomes [{id,nome}]
    async salvarMetasLote(mes, lojas, vend, nomes) {
      if (lojas.length) ok(await sb.from("metas_loja").upsert(lojas.map(x => ({ mes, loja_id: x.loja_id, assistencia: x.a, vendas: x.v })), { onConflict: "mes,loja_id" }));
      const com = vend.filter(x => x.m), sem = vend.filter(x => !x.m);
      if (com.length) ok(await sb.from("metas_vendedor").upsert(com.map(x => ({ mes, vendedor_id: x.vendedor_id, assistencia: x.m.a, vendas: x.m.v })), { onConflict: "mes,vendedor_id" }));
      if (sem.length) ok(await sb.from("metas_vendedor").delete().eq("mes", mes).in("vendedor_id", sem.map(x => x.vendedor_id)));
      for (const n of nomes) ok(await sb.from("metas_vendedores").update({ nome: n.nome }).eq("id", n.id));
    },
    async salvarCalendario(dia, aberto) { ok(await sb.from("metas_calendario").upsert({ dia, aberto }, { onConflict: "dia" })); },
    async salvarConfig(chave, valor) { ok(await sb.from("metas_config").update({ valor }).eq("chave", chave)); },
    async marcarVistos(lista) { if (lista.length) ok(await sb.from("metas_vistos").upsert(lista.map(x => ({ perfil_id: perfilId, chave: x.chave, gravidade: x.g, visto_em: new Date().toISOString() })), { onConflict: "perfil_id,chave" })); },
    async limparVistos() { ok(await sb.from("metas_vistos").delete().eq("perfil_id", perfilId)); },
    // acessos (só administrador; passa pela função do Portal que cria logins)
    async usuarios(acao, d = {}) { const r = await funcao("admin-usuarios", { acao, ...d }); return acao === "listar" ? r.usuarios : r; },
    async inscreverPush(d) { ok(await sb.from("metas_push_inscricoes").upsert(d, { onConflict: "endpoint" })); },
    async testePush() { return funcao("metas-avisos", { acao: "teste" }); },
    ouvir(f) {
      let t; const chamar = () => { clearTimeout(t); t = setTimeout(f, 500); };
      sb.channel("metas").on("postgres_changes", { event: "*", schema: "public", table: "metas_fechamentos" }, chamar).subscribe();
      let saiu = 0;
      document.addEventListener("visibilitychange", () => { if (document.hidden) saiu = Date.now(); else if (saiu && Date.now() - saiu > 30000) chamar(); });
    },
  };
}

/* ===================== DEMONSTRAÇÃO ===================== */
function apiDemo() {
  const KEY = "metas-demo-v2";
  let db = (() => { try { const r = lsGet(KEY); if (r) return JSON.parse(r); } catch (e) { } return null; })() || semente();
  const gravar = () => lsSet(KEY, JSON.stringify(db));
  const ouvintes = [];
  addEventListener("storage", e => { if (e.key === KEY) { try { db = JSON.parse(e.newValue); ouvintes.forEach(f => f()); } catch (er) { } } });
  const mudou = () => { gravar(); };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())).slice(0, 8);

  function semente() {
    let sd = 20261114; const rnd = () => { sd = sd + 0x6D2B79F5 | 0; let t = Math.imul(sd ^ sd >>> 15, 1 | sd); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const nomes = ["Loja ON", "Loja 01", "Loja 02", "Loja 03", "Loja 04", "Loja 05", "Loja 06", "Loja 07"];
    const lojas = nomes.map((n, i) => ({ id: "L" + i, nome: n, ativa: true, ordem: i, online: i === 0 }));
    const usuarios = [...lojas.map(l => ({ id: "U" + l.id, usuario: l.nome === "Loja ON" ? "lojaon" : "loja" + l.nome.slice(-2), senha: "1234", nome: l.nome, papel: "loja", loja_id: l.id, ativo: true })),
      { id: "UD", usuario: "gestao", senha: "gestao", nome: "Gestão da rede", papel: "gestao", loja_id: null, ativo: true },
      { id: "UA", usuario: "admin", senha: "admin", nome: "Admin", papel: "admin", loja_id: null, ativo: true }];
    const PL = [[["Camila", 1.05, 1], ["Diego", .95, 1.02]], [["Juliana", 1.02, 1.1], ["Rafael", .8, .7]], [["Patrícia", 1.4, .8], ["Marcos", 1, 1]], [["Fernanda", 1.35, 1.4], ["Lucas", .9, .95]],
      [["Aline", 1, 1.08], ["Gustavo", .85, .9], ["Thiago", .25, .3, 1]], [["Bruna", 1.1, 1], ["Felipe", .3, .35]], [["Larissa", 1, 1.05], ["Rodrigo", .95, .9]], [["Vanessa", 1, .95], ["Eduardo", 1.05, 1]]];
    const atraso = { L5: 1, L7: 2 }, mes = hoje().slice(0, 7) + "-01", ant = MR.mesMais(mes, -1);
    const m = { lojas, usuarios, sessao: null, vendedores: [], metasLoja: [], metasVend: [], cal: [], calLoja: [], fech: [], valores: [], corr: [], vistos: [],
      config: Object.entries(MR.CFG).map(([chave, valor]) => ({ chave, valor, descricao: DESCR[chave] })) };
    const dias = []; for (let d = mes; d < hoje(); d = MR.addDias(d, 1)) if (MR.dow(d) !== 0) dias.push(d);
    PL.forEach((vs, li) => {
      const loja_id = "L" + li;
      [mes, ant].forEach(x => m.metasLoja.push({ mes: x, loja_id, assistencia: 40000, vendas: 80000 }));
      const meus = dias.slice(0, Math.max(0, dias.length - (atraso[loja_id] || 0)));
      vs.forEach(([nome, fa, fv, semMeta], i) => {
        const v = { id: "V" + li + i, loja_id, nome, ordem: i, ativo: true }; m.vendedores.push(v);
        if (!semMeta) [mes, ant].forEach(x => m.metasVend.push({ mes: x, vendedor_id: v.id, assistencia: 20000, vendas: 40000 }));
        meus.forEach((dia, k) => {
          const queda = nome === "Eduardo" && k >= meus.length - 5 ? .3 : 1;
          const a = Math.round(20000 / 26 * fa * (.5 + rnd()) * queda / 10) * 10; let vv = Math.round(40000 / 26 * fv * (.5 + rnd()) * queda / 10) * 10;
          if (nome === "Rodrigo" && k === meus.length - 3) vv *= 9;
          m.valores.push({ fid: loja_id + dia, vendedor_id: v.id, assistencia: a, vendas: vv });
        });
      });
      meus.forEach(dia => m.fech.push({ id: loja_id + dia, loja_id, dia, status: "fechado", fechado_em: dia + "T21:00:00Z", reaberto_em: null }));
    });
    return m;
  }
  const eu = () => db.usuarios.find(u => u.id === db.sessao && u.ativo) || null;
  const exigir = (...p) => { const u = eu(); if (!u) throw new Error("Faça login novamente."); if (p.length && !p.includes(u.papel)) throw new Error("Você não tem permissão para isso."); return u; };
  const perfil = u => u && ({ id: u.id, usuario: u.usuario, nome: u.nome, papel: u.papel, loja_id: u.loja_id });
  return {
    modo: "demo",
    async sessao() { return perfil(eu()); },
    async logins() { return db.usuarios.filter(u => u.ativo).map(u => ({ usuario: u.usuario, nome: u.nome, papel: u.papel })); },
    async entrar(usuario, senha) { const u = db.usuarios.find(x => x.usuario === String(usuario).trim().toLowerCase()); if (!u || u.senha !== senha) throw new Error("Usuário ou senha incorretos."); db.sessao = u.id; gravar(); return perfil(u); },
    async sair() { db.sessao = null; gravar(); },
    async lojas() { return db.lojas; },
    async metasMes(mes) {
      const u = exigir("loja", "gestao", "admin"), fim = MR.addDias(MR.mesMais(mes, 1), -1), noMes = d => d >= mes && d <= fim;
      const vejo = l => u.papel !== "loja" || l === u.loja_id, vendLoja = id => (db.vendedores.find(v => v.id === id) || {}).loja_id;
      const fech = db.fech.filter(f => noMes(f.dia) && vejo(f.loja_id)), ids = new Set(fech.map(f => f.id));
      return { vendedores: db.vendedores.filter(v => vejo(v.loja_id)), metasLoja: db.metasLoja.filter(x => x.mes === mes && vejo(x.loja_id)), metasVend: db.metasVend.filter(x => x.mes === mes && vejo(vendLoja(x.vendedor_id))),
        cal: db.cal.filter(c => noMes(c.dia)), calLoja: db.calLoja.filter(c => noMes(c.dia) && vejo(c.loja_id)), fech,
        lanc: db.valores.filter(x => ids.has(x.fid)).map(x => { const f = fech.find(y => y.id === x.fid); return { loja_id: f.loja_id, dia: f.dia, status: f.status, vendedor_id: x.vendedor_id, assistencia: x.assistencia, vendas: x.vendas }; }),
        corr: db.corr.filter(c => ids.has(c.fechamento_id)), config: db.config, vistos: db.vistos.filter(v => v.perfil_id === u.id), proximoTemMetas: db.metasLoja.some(x => x.mes === MR.mesMais(mes, 1)) };
    },
    async fecharDia(loja, dia, valores) {
      const u = exigir("loja", "gestao", "admin"), rede = u.papel !== "loja";
      if (!rede && loja !== u.loja_id) throw new Error("Só dá para lançar o fechamento da sua loja.");
      if (dia > hoje()) throw new Error("Esse dia ainda não chegou.");
      let f = db.fech.find(x => x.loja_id === loja && x.dia === dia);
      if (f && f.status === "fechado" && !rede) throw new Error("Esse dia já está fechado. Só a gestão pode reabrir.");
      const ja = f && (f.status === "fechado" || f.reaberto_em);
      if (!f) { f = { id: loja + dia, loja_id: loja, dia, status: "aberto", fechado_em: null, reaberto_em: null }; db.fech.push(f); }
      for (const x of valores) {
        if ((db.vendedores.find(v => v.id === x.vendedor_id) || {}).loja_id !== loja) throw new Error("Vendedor não é desta loja.");
        let val = db.valores.find(y => y.fid === f.id && y.vendedor_id === x.vendedor_id);
        if (ja) ["assistencia", "vendas"].forEach(k => { const antes = val ? val[k] : 0; if (antes !== x[k]) db.corr.push({ fechamento_id: f.id, vendedor_id: x.vendedor_id, campo: k, antes, depois: x[k], em: new Date().toISOString() }); });
        if (!val) { val = { fid: f.id, vendedor_id: x.vendedor_id }; db.valores.push(val); }
        val.assistencia = x.assistencia; val.vendas = x.vendas;
      }
      f.status = "fechado"; f.fechado_em = new Date().toISOString(); mudou(); return f.id;
    },
    async reabrirDia(loja, dia) { exigir("gestao", "admin"); const f = db.fech.find(x => x.loja_id === loja && x.dia === dia && x.status === "fechado"); if (!f) throw new Error("Esse dia não está fechado."); f.status = "aberto"; f.reaberto_em = new Date().toISOString(); mudou(); },
    async copiarMetas(de, para) {
      exigir("gestao", "admin"); let n = 0;
      db.metasLoja.filter(x => x.mes === de).forEach(x => { if (!db.metasLoja.some(y => y.mes === para && y.loja_id === x.loja_id)) { db.metasLoja.push({ ...x, mes: para }); n++; } });
      db.metasVend.filter(x => x.mes === de && (db.vendedores.find(v => v.id === x.vendedor_id) || {}).ativo).forEach(x => { if (!db.metasVend.some(y => y.mes === para && y.vendedor_id === x.vendedor_id)) { db.metasVend.push({ ...x, mes: para }); n++; } });
      mudou(); return n;
    },
    async salvarVendedor(v) { exigir("gestao", "admin"); if (v.id) Object.assign(db.vendedores.find(x => x.id === v.id), v); else db.vendedores.push({ id: "V" + uid(), ativo: true, ordem: 0, ...v }); mudou(); },
    async salvarMetasLote(mes, lojas, vend, nomes) {
      exigir("gestao", "admin");
      lojas.forEach(x => { const m = db.metasLoja.find(y => y.mes === mes && y.loja_id === x.loja_id); if (m) { m.assistencia = x.a; m.vendas = x.v; } else db.metasLoja.push({ mes, loja_id: x.loja_id, assistencia: x.a, vendas: x.v }); });
      vend.forEach(x => { db.metasVend = db.metasVend.filter(y => !(y.mes === mes && y.vendedor_id === x.vendedor_id)); if (x.m) db.metasVend.push({ mes, vendedor_id: x.vendedor_id, assistencia: x.m.a, vendas: x.m.v }); });
      nomes.forEach(n => { db.vendedores.find(v => v.id === n.id).nome = n.nome; });
      mudou();
    },
    async salvarCalendario(dia, aberto) { exigir("gestao", "admin"); db.cal = db.cal.filter(c => c.dia !== dia); db.cal.push({ dia, aberto }); mudou(); },
    async salvarConfig(chave, valor) { exigir("gestao", "admin"); db.config.find(c => c.chave === chave).valor = valor; mudou(); },
    async marcarVistos(lista) { const u = exigir(); lista.forEach(x => { db.vistos = db.vistos.filter(v => !(v.perfil_id === u.id && v.chave === x.chave)); db.vistos.push({ perfil_id: u.id, chave: x.chave, gravidade: x.g, visto_em: new Date().toISOString() }); }); mudou(); },
    async limparVistos() { const u = exigir(); db.vistos = db.vistos.filter(v => v.perfil_id !== u.id); mudou(); },
    async usuarios(acao, d = {}) {
      exigir("admin");
      if (acao === "listar") return db.usuarios.map(({ senha, ...x }) => x);
      if (acao === "criar") { if (db.usuarios.some(x => x.usuario === d.usuario)) throw new Error("Esse usuário já existe."); if (String(d.senha || "").length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres."); db.usuarios.push({ id: "U" + uid(), usuario: d.usuario, senha: d.senha, nome: d.nome || d.usuario, papel: d.papel, loja_id: null, ativo: true }); }
      if (acao === "ativo") db.usuarios.find(x => x.id === d.id).ativo = !!d.ativo;
      mudou(); return { ok: true };
    },
    async inscreverPush() { throw new Error("No modo demonstração não há avisos no celular."); },
    async testePush() { },
    ouvir(f) { ouvintes.push(f); },
    async zerar() { db = semente(); gravar(); },
  };
}
const DESCR = { amarelo_pts: "Até quantos pontos abaixo do ideal fica amarelo (acima disso, vermelho)", risco_mult: "Vendedor em risco: meta diária restante maior que X vezes a normal", acima_pts: "Vendedor muito acima: pontos acima do ideal", acima_proj: "Vendedor muito acima: previsão acima de X (1,2 = 120%)", queda_fator: "Queda de ritmo: média dos últimos 5 dias abaixo de X vezes a anterior", deseq_pts: "Desequilíbrio: diferença em pontos entre Assistência e Vendas", fora_media_mult: "Possível erro de digitação: lançamento maior que X vezes a média", silencio_dias: "Sem alertas de ritmo nos primeiros X dias do mês", proj_loja: "Loja em vermelho: previsão abaixo de X", proj_rede: "Rede em vermelho: previsão abaixo de X", reta_final_dias: "Reta final: faltando X dias de venda", repetir_dias: "Aviso visto volta depois de X dias (ou antes, se piorar)" };
