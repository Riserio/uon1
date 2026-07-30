import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Consulta AO VIVO no SGA da Hinova.
 *
 * placa -> GET  /veiculo/buscar/{placa}/placa
 * cpf   -> GET  /associado/buscar/{cpf}
 * nome  -> a Hinova NAO expoe busca por nome. Resolvemos o nome na base local
 *          para descobrir placa/CPF e ai sim consultamos a API ao vivo.
 *
 * DIRECIONAMENTO (novo): antes de sair perguntando pra TODAS as associacoes,
 * usamos a base local (cadastro_registros da importacao ativa) como indice para
 * descobrir qual associacao e dona daquele CPF/placa e consultar SO ela. Se a
 * base local nao souber (associado novo/ainda nao importado), cai no fallback e
 * consulta todas. Isso mantem a busca rapida mesmo com dezenas/centenas de SGAs.
 *
 * Body: { placa?: string, cpf?: string, nome?: string, meses?: number, debug?: boolean }
 * Requer JWT do app.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onlyDigits = (v: any) => String(v ?? "").replace(/\D/g, "");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normPlaca = (v: any) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const ddmmyyyy = (d: Date) => {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

const TIMEOUT_MS = 20_000;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fetchJson = async (url: string, init: any) => {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  return await r.json().catch(() => null);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const arrOf = (j: any, ...keys: string[]): any[] => {
  if (Array.isArray(j)) return j;
  if (!j || typeof j !== "object") return [];
  for (const k of keys) if (Array.isArray(j[k])) return j[k];
  for (const k of ["dados", "data", "registros", "resultado", "retorno", "lista", "veiculos", "associados"]) {
    if (Array.isArray(j?.[k])) return j[k];
  }
  // resposta de objeto unico
  if (j.codigo_associado || j.placa || j.cpf) return [j];
  return [];
};

/**
 * Leitura tolerante a variacoes de nome de campo (acentos, camelCase, snake_case,
 * barras/espacos) e a objetos aninhados. Ex.: "CPF/CNPJ", "descricao_marca".
 */
const normKey = (k: string) =>
  k.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "").replace(/[^a-z0-9]/g, "");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pick = (o: any, ...keys: string[]): any => {
  if (!o || typeof o !== "object") return null;
  const want = new Set(keys.map(normKey));
  for (const rk of Object.keys(o)) {
    if (want.has(normKey(rk))) {
      const v = o[rk];
      if (v !== null && v !== undefined && String(v).trim() !== "") return v;
    }
  }
  for (const nested of ["veiculo", "associado", "dados", "dados_associado", "dados_veiculo"]) {
    if (o[nested] && typeof o[nested] === "object") {
      const r = pick(o[nested], ...keys);
      if (r !== null && r !== undefined && String(r).trim() !== "") return r;
    }
  }
  return null;
};

/** O endpoint de veiculo devolve um registro achatado com veiculo + associado juntos. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapVeiculo = (v: any) => ({
  placa: pick(v, "placa") ?? null,
  chassi: pick(v, "chassi") ?? null,
  tipo: pick(v, "tipo", "tipo_veiculo", "descricao_tipo") ?? null,
  categoria: pick(v, "categoria", "descricao_categoria") ?? null,
  marca: pick(v, "marca", "descricao_marca", "nome_marca", "montadora", "fabricante") ?? null,
  modelo: pick(v, "modelo", "descricao_modelo", "nome_modelo", "modelo_veiculo") ?? null,
  cor: pick(v, "cor", "descricao_cor", "codigo_cor") ?? null,
  combustivel: pick(v, "combustivel", "descricao_combustivel", "codigo_combustivel") ?? null,
  ano_fabricacao: pick(v, "ano_fabricacao", "ano") ?? null,
  ano_modelo: pick(v, "ano_modelo") ?? null,
  renavam: pick(v, "renavam") ?? null,
  km: pick(v, "km", "quilometragem") ?? null,
  valor_fipe: pick(v, "valor_fipe") ?? null,
  valor_protegido: pick(v, "valor_fipe_protegido", "valor_protegido") ?? null,
  participacao: pick(v, "participacao") ?? null,
  situacao: pick(v, "descricao_situacao", "situacao_veiculo", "situacao", "status") ?? null,
  dia_vencimento: pick(v, "dia_vencimento") ?? null,
  mes_referente: pick(v, "mes_referente") ?? null,
  regional: pick(v, "regional", "nome_regional", "descricao_regional", "codigo_regional") ?? null,
  cooperativa: pick(v, "cooperativa", "nome_cooperativa", "descricao_cooperativa", "codigo_cooperativa") ?? null,
  codigo_veiculo: pick(v, "codigo_veiculo") ?? null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapAssociado = (v: any) => {
  const ddd = pick(v, "ddd");
  const tel = pick(v, "telefone");
  const dddCel = pick(v, "ddd_celular");
  const cel = pick(v, "telefone_celular", "celular");
  const fmtTel = (d: any, n: any) => (n ? `${d ? "(" + d + ") " : ""}${n}` : null);
  return {
    nome: pick(v, "nome", "nome_associado", "nome_completo", "razao_social") ?? null,
    cpf: pick(v, "cpf", "cpf_cnpj", "cpf_associado", "documento", "numero_documento") ?? null,
    rg: pick(v, "rg") ?? null,
    email: pick(v, "email") ?? null,
    telefone: fmtTel(ddd, tel),
    celular: fmtTel(dddCel, cel),
    cidade: pick(v, "cidade", "cidade_associado") ?? null,
    estado: pick(v, "estado", "uf") ?? null,
    bairro: pick(v, "bairro") ?? null,
    logradouro: pick(v, "logradouro", "endereco") ?? null,
    cep: pick(v, "cep") ?? null,
    regional: pick(v, "regional", "nome_regional", "descricao_regional", "codigo_regional") ?? null,
    cooperativa: pick(v, "cooperativa", "nome_cooperativa", "descricao_cooperativa", "codigo_cooperativa") ?? null,
    situacao: pick(v, "descricao_situacao", "situacao", "situacao_associado") ?? null,
    data_cadastro: pick(v, "data_cadastro") ?? null,
    data_contrato: pick(v, "data_contrato") ?? null,
    codigo_associado: pick(v, "codigo_associado") ?? null,
    voluntario: pick(v, "nome_voluntario", "voluntario") ?? null,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") || "";
  const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await anon.auth.getUser();
  if (!userData?.user) {
    return new Response(JSON.stringify({ success: false, message: "Nao autenticado" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const placa = normPlaca(body.placa);
    const cpf = onlyDigits(body.cpf);
    const nome = String(body.nome ?? "").trim();
    const meses = Math.min(Math.max(Number(body.meses) || 12, 1), 24);
    const debug = body.debug === true;
    // detalhes=false (padrao): retorna SO o card (associado + veiculo), rapido.
    // detalhes=true: busca tambem boletos/eventos/MGF (sob demanda, quando o
    // usuario abre a secao na tela). Evita 30-60s de espera no card inicial.
    const detalhes = body.detalhes === true;

    if (!placa && !cpf && !nome) {
      return new Response(JSON.stringify({ success: false, message: "Informe placa, CPF ou nome" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: creds } = await supabase
      .from("hinova_credenciais")
      .select("corretora_id, api_token, api_base_url, hinova_user, hinova_pass, hinova_url, usar_api")
      .eq("usar_api", true);

    const alvos = (creds || []).filter((c) => c.api_token && c.hinova_user && c.hinova_pass);
    const ids = alvos.map((c) => c.corretora_id);
    const { data: corretoras } = ids.length
      ? await supabase.from("corretoras").select("id, nome").in("id", ids)
      : { data: [] as { id: string; nome: string }[] };
    const nomeById = new Map((corretoras || []).map((c) => [c.id, c.nome]));

    /**
     * Busca por nome: a API da Hinova nao tem endpoint de nome. Resolvemos o nome
     * contra a base local (cadastro) para obter placas, e cada placa vira uma
     * consulta direcionada ao vivo — restrita a associacao onde o nome bateu.
     */
    const placasPorCorretora = new Map<string, Set<string>>();
    let nomeSemMatchLocal = false;
    if (nome && !placa && !cpf) {
      const { data: locais } = await supabase
        .from("cadastro_registros")
        .select("placa, cpf, importacao_id, cadastro_importacoes!inner(corretora_id, ativo)")
        .ilike("nome", `%${nome}%`)
        .eq("cadastro_importacoes.ativo", true)
        .limit(50);
      for (const l of (locais || [])) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cid = (l as any).cadastro_importacoes?.corretora_id;
        const p = normPlaca((l as any).placa);
        if (!cid || !p) continue;
        if (!placasPorCorretora.has(cid)) placasPorCorretora.set(cid, new Set());
        placasPorCorretora.get(cid)!.add(p);
      }
      nomeSemMatchLocal = placasPorCorretora.size === 0;
    }

    /**
     * DIRECIONAMENTO por CPF/placa: usa a base local como indice para descobrir a(s)
     * associacao(oes) dona(s) e consultar SO ela(s). Se nao achar nada local, cai no
     * fallback (consulta todas). Escala para muitas associacoes sem perder resultado.
     */
    const corretorasDirecionadas = new Set<string>();
    // Dados da base local (importacao ativa) para ENRIQUECER o resultado do SGA:
    // preenchem os campos que a API ao vivo nao devolve (marca, modelo, ano,
    // regional, cooperativa, cidade...). Indexados por placa e por CPF.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const localPorPlaca = new Map<string, any>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const localPorCpf = new Map<string, any>();
    if (cpf || placa) {
      // Busca em TODAS as importacoes (nao so a ativa): assim, se a base ativa
      // perdeu algum campo (ex.: cooperativa/regional vindo NULL), ele ainda e
      // recuperado de uma importacao anterior que o tinha.
      let q = supabase
        .from("cadastro_registros")
        .select("nome, cpf, placa, chassi, marca_veiculo, modelo_veiculo, ano_veiculo, situacao, regional, cooperativa, cidade, estado, valor_protegido, data_cadastro, data_adesao, cadastro_importacoes!inner(corretora_id, ativo, created_at)")
        .limit(300);
      if (cpf) q = q.eq("cpf", cpf);
      else if (placa) q = q.ilike("placa", placa);
      const { data: locais } = await q;
      // Ordena: base ATIVA primeiro, depois a mais recente. O merge abaixo pega o
      // primeiro valor nao-nulo de cada campo nessa ordem (ativa/recente vence).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ordenados = ((locais || []) as any[]).slice().sort((a, b) => {
        const aa = a.cadastro_importacoes?.ativo ? 1 : 0;
        const bb = b.cadastro_importacoes?.ativo ? 1 : 0;
        if (aa !== bb) return bb - aa;
        return String(b.cadastro_importacoes?.created_at || "").localeCompare(String(a.cadastro_importacoes?.created_at || ""));
      });
      const CAMPOS = ["nome", "cpf", "placa", "chassi", "marca_veiculo", "modelo_veiculo", "ano_veiculo", "situacao", "regional", "cooperativa", "cidade", "estado", "valor_protegido", "data_cadastro", "data_adesao"];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mergeInto = (map: Map<string, any>, key: string, row: any) => {
        if (!key) return;
        const cur = map.get(key) || {};
        for (const f of CAMPOS) {
          if ((cur[f] == null || cur[f] === "") && row[f] != null && row[f] !== "") cur[f] = row[f];
        }
        map.set(key, cur);
      };
      for (const l of ordenados) {
        const cid = l.cadastro_importacoes?.corretora_id;
        // Direcionamento so considera a base ATIVA (onde o registro esta hoje).
        if (cid && l.cadastro_importacoes?.ativo) corretorasDirecionadas.add(cid);
        mergeInto(localPorPlaca, normPlaca(l.placa), l);
        mergeInto(localPorCpf, onlyDigits(l.cpf), l);
      }
    }
    const direcionado = corretorasDirecionadas.size > 0;
    const alvosParaConsultar = direcionado
      ? alvos.filter((c) => corretorasDirecionadas.has(c.corretora_id))
      : alvos;

    const consultar = async (c: typeof alvos[number]) => {
      const base = (c.api_base_url || "https://api.hinova.com.br/api/sga/v2").replace(/\/$/, "");
      const nomeAssoc = nomeById.get(c.corretora_id) || c.corretora_id;
      const status = {
        associacao: nomeAssoc,
        cadastro: { status: null as string | null, erro: null as string | null, origem: "api" },
        cobranca: { status: null as string | null, erro: null as string | null, origem: "api" },
        eventos: { status: null as string | null, erro: null as string | null, origem: "api" },
        mgf: { status: null as string | null, erro: null as string | null, origem: "api" },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resultados: any[] = [];

      try {
        const authJson = await fetchJson(`${base}/usuario/autenticar`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.api_token}` },
          body: JSON.stringify({ usuario: c.hinova_user, senha: c.hinova_pass }),
        });
        const token = authJson?.token_usuario;
        if (!token) throw new Error(authJson?.error?.mensagem || "Falha na autenticacao da API");
        const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

        // ---- 1) Localizar o(s) veiculo(s) pelo criterio, sem varrer a base ----
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let achados: any[] = [];
        if (placa) {
          achados = arrOf(await fetchJson(`${base}/veiculo/buscar/${placa}/placa`, { method: "GET", headers: H }));
        } else if (cpf) {
          // A resposta de /associado/buscar/{cpf} vem como o ASSOCIADO com um array
          // `veiculos` dentro. O arrOf antigo desembrulhava para os veiculos e perdia
          // os campos do associado (nome/cpf/cidade). Aqui preservamos o associado e o
          // anexamos em cada veiculo (__assoc) para o card exibir tudo.
          const aj = await fetchJson(`${base}/associado/buscar/${cpf}`, { method: "GET", headers: H });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const assocObj: any = Array.isArray(aj) ? (aj[0] || null) : (aj?.associado || aj || null);
          const veics = arrOf(aj, "veiculos");
          if (veics.length > 0) {
            achados = veics.map((v: any) => ({ ...v, __assoc: assocObj }));
          } else if (assocObj && (pick(assocObj, "cpf", "cpf_cnpj", "documento") || pick(assocObj, "nome", "nome_associado"))) {
            achados = [{ __assoc: assocObj }];
          }
        } else if (nome) {
          const placasLocais = placasPorCorretora.get(c.corretora_id);
          if (!placasLocais || placasLocais.size === 0) {
            status.cadastro.status = "sucesso";
            return { status, resultados };
          }
          for (const p of Array.from(placasLocais).slice(0, 10)) {
            achados.push(...arrOf(await fetchJson(`${base}/veiculo/buscar/${p}/placa`, { method: "GET", headers: H })));
          }
        }
        status.cadastro.status = "sucesso";
        if (achados.length === 0) return { status, resultados };

        // ---- 2) So aqui (deu match) buscamos os detalhes ----
        const hoje = new Date();
        const inicio = addDays(hoje, -30 * meses);
        const placasAchadas = new Set(achados.map((v) => normPlaca(v?.placa ?? v?.__assoc?.placa)).filter(Boolean));
        const cpfsAchados = new Set(
          achados.map((v) => onlyDigits(v?.cpf ?? v?.__assoc?.cpf ?? v?.__assoc?.cpf_cnpj)).filter(Boolean),
        );
        const codsAssoc = new Set(
          achados.map((v) => String(v?.codigo_associado ?? v?.__assoc?.codigo_associado ?? "")).filter(Boolean),
        );

        const buscarBoletos = async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const out: any[] = [];
          let cur = new Date(inicio);
          while (cur <= hoje) {
            const fim = addDays(cur, 30) > hoje ? hoje : addDays(cur, 30);
            const j = await fetchJson(`${base}/listar/boleto-associado/periodo`, {
              method: "POST", headers: H,
              body: JSON.stringify({ data_vencimento_inicial: ddmmyyyy(cur), data_vencimento_final: ddmmyyyy(fim) }),
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const b of arrOf(j, "boletos") as any[]) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const ps = (Array.isArray(b?.veiculos) ? b.veiculos : []).map((v: any) => normPlaca(v?.placa));
              const bate = cpfsAchados.has(onlyDigits(b?.cpf)) || ps.some((p: string) => placasAchadas.has(p));
              if (bate) {
                out.push({
                  ...(debug && out.length === 0 ? { _raw: b } : {}),
                  vencimento: b?.data_vencimento ?? null,
                  vencimento_original: b?.data_vencimento_original ?? null,
                  valor: b?.valor ?? b?.valor_boleto ?? null,
                  situacao: b?.situacao ?? b?.descricao_situacao ?? null,
                  pagamento: b?.data_pagamento ?? null,
                  nosso_numero: b?.nosso_numero ?? null,
                  mes_referente: b?.mes_referente ?? null,
                  tipo_boleto: b?.tipo_boleto ?? null,
                });
              }
            }
            cur = addDays(fim, 1);
          }
          return out.sort((a, b) => String(b.vencimento).localeCompare(String(a.vencimento)));
        };

        const buscarEventos = async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const out: any[] = [];
          let cur = new Date(inicio);
          while (cur <= hoje) {
            const fim = addDays(cur, 29) > hoje ? hoje : addDays(cur, 29);
            const j = await fetchJson(`${base}/listar/evento`, {
              method: "POST", headers: H,
              body: JSON.stringify({ data_cadastro: ddmmyyyy(cur), data_cadastro_final: ddmmyyyy(fim) }),
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const ev of arrOf(j) as any[]) {
              const p = normPlaca(ev?.veiculo?.placa ?? ev?.placa);
              if (placasAchadas.has(p) || cpfsAchados.has(onlyDigits(ev?.associado?.cpf ?? ev?.cpf))) {
                out.push({
                  data: ev?.data_evento ?? ev?.data_cadastro ?? null,
                  tipo: ev?.tipo_evento ?? ev?.descricao_tipo_evento ?? null,
                  situacao: ev?.situacao_evento ?? ev?.descricao_situacao ?? null,
                  protocolo: ev?.protocolo ?? ev?.codigo_evento ?? null,
                  motivo: ev?.motivo_evento ?? null,
                  valor_reparo: ev?.valor_reparo ?? null,
                });
              }
            }
            cur = addDays(fim, 1);
          }
          return out;
        };

        const buscarMgf = async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const out: any[] = [];
          if (codsAssoc.size === 0 && cpfsAchados.size === 0) return out;
          const PAGE = 1000;
          let ini = 0;
          for (let pag = 0; pag < 20; pag++) {
            const j = await fetchJson(`${base}/mgf-lancamento/listar`, {
              method: "POST", headers: H,
              body: JSON.stringify({
                data_vencimento_inicial: ddmmyyyy(inicio), data_vencimento_final: ddmmyyyy(hoje),
                quantidade_por_pagina: PAGE, inicio_paginacao: ini,
              }),
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const arr = arrOf(j, "retorno") as any[];
            for (const L of arr) {
              const bate = codsAssoc.has(String(L?.codigo_associado ?? "")) ||
                cpfsAchados.has(onlyDigits(L?.cpf_associado ?? L?.cpf));
              if (bate) {
                out.push({
                  vencimento: L?.data_vencimento ?? null,
                  descricao: L?.descricao ?? null,
                  valor: L?.valor ?? null,
                  situacao: L?.situacao_pagamento ?? null,
                  operacao: L?.operacao ?? null,
                });
              }
            }
            if (arr.length < PAGE) break;
            ini += PAGE;
          }
          return out;
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let boletos: any[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let eventos: any[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let mgf: any[] = [];
        // So busca os detalhes (caros: varrem meses na Hinova) quando pedidos.
        if (detalhes) {
          [boletos, eventos, mgf] = await Promise.all([
            buscarBoletos().then((r) => { status.cobranca.status = "sucesso"; return r; })
              .catch((e) => { status.cobranca.status = "erro"; status.cobranca.erro = String(e?.message ?? e); return []; }),
            buscarEventos().then((r) => { status.eventos.status = "sucesso"; return r; })
              .catch((e) => { status.eventos.status = "erro"; status.eventos.erro = String(e?.message ?? e); return []; }),
            buscarMgf().then((r) => { status.mgf.status = "sucesso"; return r; })
              .catch((e) => { status.mgf.status = "erro"; status.mgf.erro = String(e?.message ?? e); return []; }),
          ]);
        }

        for (const v of achados) {
          const assocSrc = (v && v.__assoc) ? v.__assoc : v;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const veic: any = mapVeiculo(v);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const assoc: any = mapAssociado(assocSrc);
          // ENRIQUECIMENTO: preenche SO os campos vazios com a base local importada.
          // O SGA e a fonte ao vivo (status); a base local completa o que a API nao traz.
          const loc = localPorPlaca.get(normPlaca(veic.placa)) || localPorCpf.get(onlyDigits(assoc.cpf)) || null;
          if (loc) {
            veic.marca = veic.marca ?? loc.marca_veiculo ?? null;
            veic.modelo = veic.modelo ?? loc.modelo_veiculo ?? null;
            if (veic.ano_modelo == null && veic.ano_fabricacao == null && loc.ano_veiculo != null) veic.ano_modelo = loc.ano_veiculo;
            veic.regional = veic.regional ?? loc.regional ?? null;
            veic.cooperativa = veic.cooperativa ?? loc.cooperativa ?? null;
            veic.valor_protegido = veic.valor_protegido ?? loc.valor_protegido ?? null;
            veic.situacao = veic.situacao ?? loc.situacao ?? null;
            veic.cidade = veic.cidade ?? loc.cidade ?? null;
            veic.estado = veic.estado ?? loc.estado ?? null;
            assoc.nome = assoc.nome ?? loc.nome ?? null;
            assoc.cpf = assoc.cpf ?? loc.cpf ?? null;
            assoc.cidade = assoc.cidade ?? loc.cidade ?? null;
            assoc.estado = assoc.estado ?? loc.estado ?? null;
            assoc.regional = assoc.regional ?? loc.regional ?? null;
            assoc.cooperativa = assoc.cooperativa ?? loc.cooperativa ?? null;
            assoc.situacao = assoc.situacao ?? loc.situacao ?? null;
            assoc.data_cadastro = assoc.data_cadastro ?? loc.data_cadastro ?? null;
          }
          resultados.push({
            associacao: nomeAssoc,
            sga_url: c.hinova_url ?? null,
            origem_dados: loc ? "sga+local" : "sga",
            veiculo: debug ? { ...veic, _raw: v } : veic,
            associado: debug ? { ...assoc, _raw: assocSrc } : assoc,
            boletos,
            eventos,
            mgf,
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        status.cadastro.status = "erro";
        status.cadastro.erro = msg;
      }
      return { status, resultados };
    };

    // Consulta so as associacoes direcionadas (ou todas, no fallback), em paralelo.
    const saidas = await Promise.all(alvosParaConsultar.map(consultar));
    const resultados = saidas.flatMap((s) => s.resultados);
    const apis_ativas = saidas.map((s) => s.status).sort((a, b) => a.associacao.localeCompare(b.associacao));

    return new Response(JSON.stringify({
      success: true,
      origem: "api",
      criterio: { placa: placa || null, cpf: cpf || null, nome: nome || null },
      // Direcionamento: quantas associacoes foram realmente consultadas e se veio do indice local.
      direcionado,
      associacoes_consultadas: alvosParaConsultar.length,
      associacoes_ativas: alvos.length,
      aviso: nome && nomeSemMatchLocal
        ? "A API da Hinova nao permite busca por nome. Nenhum cadastro local bateu com esse nome, entao nao houve o que consultar ao vivo. Tente por placa ou CPF."
        : (nome ? "A API da Hinova nao permite busca por nome: o nome foi resolvido na base local e as placas encontradas foram consultadas ao vivo." : null),
      total: resultados.length,
      resultados,
      apis_ativas,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    console.error("[consultar-associado-hinova]", msg);
    return new Response(JSON.stringify({ success: false, message: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
