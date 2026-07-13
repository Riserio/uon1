// lovable-deploy: deploy nudge 2026-07-13T03:26:07Z
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------- helpers ----------
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  let s = String(v).trim();
  // Formato BR: "1.234,56" (milhar com ponto, decimal com virgula) ou "3546,00".
  if (/,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};
const dateISO = (v: unknown): string | null => {
  if (!v || typeof v !== "string") return null;
  // API devolve YYYY-MM-DD; ignora placeholders "9999-99-99"/"0000-00-00"
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || m[1] === "9999" || m[1] === "0000") return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
};
const int = (v: unknown): number | null => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const ddmmyyyy = (d: Date): string => {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const parseBR = (s: string): Date | null => {
  const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
};
const addDays = (d: Date, n: number): Date => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

// Mapeia módulo -> tabelas de config/execuções para persistir erros da API (mesmo
// padrão de tabelas já usado pelo caminho de crawl/GitHub Actions).
function tabelasDoModulo(modulo: string): { configTable: string; execTable: string } | null {
  switch (modulo) {
    case "cobranca":
      return { configTable: "cobranca_automacao_config", execTable: "cobranca_automacao_execucoes" };
    case "eventos":
      return { configTable: "sga_automacao_config", execTable: "sga_automacao_execucoes" };
    case "mgf":
      return { configTable: "mgf_automacao_config", execTable: "mgf_automacao_execucoes" };
    default:
      return null;
  }
}

// Grava o erro REAL da chamada à API Hinova (antes disso, uma falha aqui só gerava
// console.error e ficava invisível — o painel só mostrava o erro do fallback/crawl).
// Isso alimenta o mesmo histórico/log que a tela já exibe pra Cobrança/Eventos/MGF.
// deno-lint-ignore no-explicit-any
async function persistApiError(supabase: any, modulo: string, corretoraId: string | undefined, msg: string) {
  if (!corretoraId) return;
  const tabelas = tabelasDoModulo(modulo);
  if (!tabelas) return;
  try {
    const { data: config } = await supabase
      .from(tabelas.configTable)
      .select("id")
      .eq("corretora_id", corretoraId)
      .maybeSingle();

    await supabase
      .from(tabelas.configTable)
      .update({
        ultimo_status: "erro",
        ultimo_erro: msg,
        ultima_execucao: new Date().toISOString(),
        ultima_origem: "api",
      })
      .eq("corretora_id", corretoraId);

    await supabase.from(tabelas.execTable).insert({
      config_id: config?.id ?? null,
      corretora_id: corretoraId,
      status: "erro",
      etapa_atual: "api",
      tipo_disparo: "api",
      mensagem: "Tentativa via API SGA Hinova",
      erro: msg,
      finalizado_at: new Date().toISOString(),
    });
  } catch (persistErr) {
    console.error("[importar-api-hinova] Falha ao persistir erro da API:", persistErr);
  }
}

// ---------- merge incremental ----------
// deno-lint-ignore no-explicit-any
type AnyRow = any;

// Garante que exista exatamente UMA importação ativa para a corretora+tabela e
// devolve o id dela. Se já existir mais de uma ativa (resquício de um bug
// anterior em que cada rodada criava uma nova e desativava as outras, mas
// nunca convergia), higieniza mantendo só a mais recente.
// deno-lint-ignore no-explicit-any
async function getOrCreateImportacaoAtiva(
  supabase: AnyRow,
  table: string,
  corretoraId: string,
  nomeArquivo: string,
): Promise<{ id: string; isNova: boolean }> {
  const { data: ativas } = await supabase
    .from(table)
    .select("id")
    .eq("corretora_id", corretoraId)
    .eq("ativo", true)
    .order("created_at", { ascending: false });

  if (ativas && ativas.length > 0) {
    const id = ativas[0].id as string;
    if (ativas.length > 1) {
      // Higieniza duplicatas de execuções passadas antes de continuar.
      await supabase.from(table).update({ ativo: false }).eq("corretora_id", corretoraId).neq("id", id);
    }
    return { id, isNova: false };
  }

  const { data: nova, error } = await supabase
    .from(table)
    .insert({ nome_arquivo: nomeArquivo, total_registros: 0, corretora_id: corretoraId, ativo: true })
    .select("id")
    .single();
  if (error) throw new Error(`Erro ao criar importação em ${table}: ${error.message}`);
  return { id: nova.id as string, isNova: true };
}

// Funde `newRows` (buscados agora na API, cobrindo uma janela de datas) na
// importação ATIVA já existente, em vez do padrão antigo de criar uma
// importação nova e desativar a anterior a cada execução.
//
// Regras:
//  - Registro cuja "chave natural" (protocolo, nosso_numero, etc.) já existir
//    na importação ativa é SUBSTITUÍDO pela versão nova (cobre alterações —
//    situação do evento, valor do boleto, data de pagamento etc.).
//  - Registro com chave nova é apenas inserido (complementa a base).
//  - Registros antigos cuja chave não aparece nesta rodada (ex.: fora da
//    janela de datas pedida agora, ou vindos de uma importação manual/Excel
//    anterior à automação via API) NÃO são tocados — é assim que o histórico
//    completo nunca é perdido, mesmo que cada chamada à API só traga uma
//    janela parcial (ex.: últimos 18 meses).
async function mergeIncremental(
  supabase: AnyRow,
  table: string,
  importacaoId: string,
  newRows: AnyRow[],
  keyOf: (row: AnyRow) => string | null,
  selectCols: string,
): Promise<{ atualizados: number; novos: number; totalProcessado: number }> {
  const PAGE = 1000;
  const existing = new Map<string, string>(); // chave natural -> id da linha existente
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(selectCols)
      .eq("importacao_id", importacaoId)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Erro ao ler ${table} existentes: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data as AnyRow[]) {
      const k = keyOf(row);
      if (k) existing.set(k, row.id);
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  const idsToDelete: string[] = [];
  for (const row of newRows) {
    const k = keyOf(row);
    if (k && existing.has(k)) idsToDelete.push(existing.get(k)!);
  }
  const rowsToInsert = newRows.map((row) => ({ ...row, importacao_id: importacaoId }));

  // Remove as versões antigas dos registros que serão substituídos pela nova versão.
  for (let i = 0; i < idsToDelete.length; i += 500) {
    const lote = idsToDelete.slice(i, i + 500);
    const { error } = await supabase.from(table).delete().in("id", lote);
    if (error) throw new Error(`Erro ao remover ${table} desatualizados (lote ${i}): ${error.message}`);
  }

  // Insere os registros novos e as versões atualizadas.
  for (let i = 0; i < rowsToInsert.length; i += 500) {
    const lote = rowsToInsert.slice(i, i + 500);
    const { error } = await supabase.from(table).insert(lote);
    if (error) throw new Error(`Erro ao inserir ${table} (lote ${i}): ${error.message}`);
  }

  return {
    atualizados: idsToDelete.length,
    novos: rowsToInsert.length - idsToDelete.length,
    totalProcessado: rowsToInsert.length,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Declarados fora do try para o catch conseguir persistir o erro real vinculado à corretora/módulo.
  let corretora_id: string | undefined;
  let modulo = "eventos";

  try {
    const body = await req.json().catch(() => ({}));
    corretora_id = body.corretora_id;
    modulo = body.modulo || "eventos";
    if (!corretora_id) {
      return new Response(JSON.stringify({ success: false, message: "corretora_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Credenciais da API
    const { data: cred } = await supabase
      .from("hinova_credenciais")
      .select("api_token, api_base_url, hinova_user, hinova_pass, usar_api")
      .eq("corretora_id", corretora_id)
      .maybeSingle();

    if (!cred?.api_token || !cred?.hinova_user || !cred?.hinova_pass) {
      return new Response(JSON.stringify({ success: false, message: "API não configurada (token/usuário/senha)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const base = (cred.api_base_url || "https://api.hinova.com.br/api/sga/v2").replace(/\/$/, "");

    // 1) Autenticar -> token_usuario (nao expira)
    const authRes = await fetch(`${base}/usuario/autenticar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cred.api_token}` },
      body: JSON.stringify({ usuario: cred.hinova_user, senha: cred.hinova_pass }),
    });
    const authJson = await authRes.json().catch(() => ({}));
    const tokenUsuario = authJson?.token_usuario;
    if (!tokenUsuario) {
      const msg = authJson?.error?.mensagem || authJson?.mensagem || "Falha na autenticação da API";
      throw new Error(`API auth: ${msg}`);
    }
    const H = { "Content-Type": "application/json", Authorization: `Bearer ${tokenUsuario}` };

    if (modulo !== "eventos" && modulo !== "mgf" && modulo !== "cobranca" && modulo !== "base") {
      return new Response(
        JSON.stringify({
          debug_associado: assocDebug, success: false, message: `Módulo '${modulo}' ainda não implementado na API` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ================= BASE (veículos/associados) → Cadastro + Estudo de Base =================
    if (modulo === "base") {
      // Endpoint oficial (mudança da Hinova ~10/07/2026): POST /listar/veiculo
      // passou a EXIGIR codigo_situacao e devolve objeto paginado
      // { total_veiculos, numero_paginas, pagina_corrente, veiculos: [...] }
      // (máx. 5000 por página). Situações VALECAR-like: 1=ATIVO, 2=INATIVO,
      // 3=PENDENTE, 4=INADIMPLENTE, 5=NEGADO, 6=CANCELAMENTO, 7=REVISTORIA,
      // 8=REATIVAÇÃO. Busca todas as páginas de cada situação configurada
      // (default: só 1=ATIVO; aceita body.codigos_situacao, ex. ["1","8"]).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extrairArray = (j: any): any[] | null => {
        if (Array.isArray(j)) return j;
        if (!j || typeof j !== "object") return null;
        for (const k of ["veiculos", "associados", "dados", "data", "registros", "resultado", "lista"]) {
          if (Array.isArray(j[k])) return j[k];
        }
        return null;
      };
      // Situação padrão da importação diária: apenas 1=ATIVO. Motivo: no ambiente
      // VALECAR o endpoint /listar/veiculo com codigo_situacao=4 (INADIMPLENTE)
      // devolveu ~4955 placas (praticamente toda a base, sobrepondo os ativos) em
      // vez das ~200 esperadas, além de paginação duplicando registros. Enquanto a
      // origem correta de inadimplentes não é definida, a base diária traz só ATIVO
      // (contagem correta e sempre atual). Para trazer outras situações, envie
      // body.codigos_situacao (ex.: ["1","4"]).
      const codigosSituacao: string[] =
        Array.isArray(body?.codigos_situacao) && body.codigos_situacao.length > 0
          ? body.codigos_situacao.map((c: unknown) => String(c))
          : ["1"];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let veiculos: any[] | null = null;
      let endpointOk: string | null = null;
      const tentativas: string[] = [];
      for (const cod of codigosSituacao) {
        let pagina = 1;
        let totalPaginas = 1;
        while (pagina <= totalPaginas && pagina <= 20) {
          try {
            const r = await fetch(`${base}/listar/veiculo`, {
              method: "POST",
              headers: H,
              body: JSON.stringify({ codigo_situacao: cod, pagina: String(pagina) }),
            });
            const j = await r.json().catch(() => null);
            const arr = extrairArray(j);
            tentativas.push(
              `POST /listar/veiculo situacao=${cod} pag=${pagina} → ${r.status}${arr ? ` (${arr.length})` : ""}`,
            );
            if (!r.ok || !arr) break;
            veiculos = (veiculos || []).concat(arr);
            endpointOk = "POST /listar/veiculo";
            totalPaginas = Math.min(Number(j?.numero_paginas) || 1, 20);
            pagina++;
          } catch (_e) {
            tentativas.push(`POST /listar/veiculo situacao=${cod} pag=${pagina} → erro`);
            break;
          }
        }
      }

      if (veiculos === null) {
        return new Response(
          JSON.stringify({
            success: false,
            modulo: "base",
            message: "Nenhum endpoint de listagem de veículos respondeu. Confirme o endpoint com a Hinova.",
            tentativas,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // helpers de leitura tolerante a nomes de campo
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (o: any, ...keys: string[]): any => {
        for (const k of keys) {
          if (o && o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
          // suporta objeto aninhado "veiculo"/"associado"
          if (o?.veiculo && o.veiculo[k] !== undefined && o.veiculo[k] !== null && o.veiculo[k] !== "")
            return o.veiculo[k];
          if (o?.associado && o.associado[k] !== undefined && o.associado[k] !== null && o.associado[k] !== "")
            return o.associado[k];
        }
        return null;
      };

      // Busca associados para preencher CIDADE/ESTADO e dados demográficos
      // (SEXO, ESTADO CIVIL e IDADE — o veículo não traz esses dados)
      const idadeFromNascimento = (v: unknown): number | null => {
        if (!v || typeof v !== "string") return null;
        let dt: Date | null = null;
        const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
        const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (iso && iso[1] !== "9999" && iso[1] !== "0000") {
          dt = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
        } else if (br) {
          dt = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
        }
        if (!dt || Number.isNaN(dt.getTime())) return null;
        const idade = Math.floor((Date.now() - dt.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        return idade > 0 && idade < 130 ? idade : null;
      };
      const normalizaSexo = (v: unknown): string | null => {
        const s = String(v ?? "").trim().toUpperCase();
        if (!s) return null;
        if (s.startsWith("M")) return "MASCULINO";
        if (s.startsWith("F")) return "FEMININO";
        return s;
      };
      const assocMap = new Map<
        string,
        { cidade: string | null; estado: string | null; sexo: string | null; estado_civil: string | null; idade: number | null }
      >();
      // Debug do endpoint de associado (para confirmar contrato/campos reais da Hinova)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assocDebug: any = { tentativas: [], amostra_keys: null, total: 0 };
      try {
        // /listar/associado passou a exigir paginação (mesma mudança do /listar/veiculo).
        // Percorre as páginas de cada código de situação configurado.
        for (const cod of codigosSituacao) {
          let apag = 1;
          let atot = 1;
          while (apag <= atot && apag <= 20) {
            const ar = await fetch(`${base}/listar/associado`, {
              method: "POST",
              headers: H,
              body: JSON.stringify({ codigo_situacao: cod, pagina: String(apag) }),
            });
            const aj = await ar.json().catch(() => null);
            const aarr = extrairArray(aj) || [];
            assocDebug.tentativas.push(`situacao=${cod} pag=${apag} → ${ar.status} (${aarr.length})`);
            if (!ar.ok || aarr.length === 0) break;
            if (!assocDebug.amostra_keys && aarr[0]) assocDebug.amostra_keys = Object.keys(aarr[0]);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const a of aarr as any[]) {
              const codA = String(a.codigo_associado ?? a.codigo ?? "");
              if (codA)
                assocMap.set(codA, {
                  cidade: a.cidade ?? a.cidade_associado ?? null,
                  estado: a.estado ?? a.uf ?? null,
                  sexo: normalizaSexo(a.sexo ?? a.sexo_associado),
                  estado_civil: (a.estado_civil ?? a.estado_civil_associado ?? null) as string | null,
                  idade: int(a.idade) ?? idadeFromNascimento(a.data_nascimento ?? a.nascimento ?? a.data_nascimento_associado),
                });
            }
            atot = Math.min(Number(aj?.numero_paginas) || 1, 20);
            apag++;
          }
        }
        assocDebug.total = assocMap.size;
      } catch (e) {
        assocDebug.erro = String((e as Error)?.message || e);
      }

      // Mapear -> Cadastro (lista bruta)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cadastro = veiculos.map((v: any) => {
        const assocC = assocMap.get(String(g(v, "codigo_associado") ?? ""));
        return {
          nome: g(v, "nome_associado", "nome", "associado_nome") as string | null,
          cpf: g(v, "cpf", "cpf_cnpj", "documento") as string | null,
          placa: g(v, "placa") as string | null,
          modelo_veiculo: g(v, "modelo", "modelo_veiculo", "descricao_modelo") as string | null,
          marca_veiculo: g(v, "marca", "montadora", "fabricante") as string | null,
          ano_veiculo:
            (g(v, "ano_modelo", "ano_fabricacao", "ano") ?? null)
              ? String(g(v, "ano_modelo", "ano_fabricacao", "ano"))
              : null,
          situacao: g(v, "situacao", "situacao_veiculo", "descricao_situacao", "status") as string | null,
          regional: g(v, "regional") as string | null,
          cooperativa: g(v, "cooperativa") as string | null,
          data_cadastro: dateISO(g(v, "data_cadastro", "data_contrato")),
          data_adesao: dateISO(g(v, "data_adesao", "data_contrato")),
          valor_protegido: num(g(v, "valor_protegido", "valor_fipe_protegido", "valor_fipe")),
          cidade: (g(v, "cidade", "cidade_veiculo", "cidade_proprietario") as string | null) || assocC?.cidade || null,
          estado: (g(v, "estado", "uf") as string | null) || assocC?.estado || null,
        };
      });

      // Mapear -> Estudo de Base (lista rica) — alimenta a agregação por categoria
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eb = veiculos.map((v: any) => {
        const assocE = assocMap.get(String(g(v, "codigo_associado") ?? ""));
        return {
          placa: g(v, "placa") as string | null,
          tipo_veiculo: g(v, "tipo_veiculo", "tipo", "especie") as string | null,
          montadora: g(v, "montadora", "marca", "fabricante") as string | null,
          modelo: g(v, "modelo", "modelo_veiculo") as string | null,
          ano_fabricacao: int(g(v, "ano_fabricacao", "ano")),
          ano_modelo: int(g(v, "ano_modelo")),
          combustivel: g(v, "combustivel") as string | null,
          cota: g(v, "cota") as string | null,
          categoria: g(v, "categoria") as string | null,
          cor: g(v, "cor") as string | null,
          valor_protegido: num(g(v, "valor_protegido", "valor_fipe_protegido")),
          valor_fipe: num(g(v, "valor_fipe", "valor_protegido")),
          cooperativa: g(v, "cooperativa") as string | null,
          regional: g(v, "regional") as string | null,
          situacao_veiculo: g(v, "situacao_veiculo", "situacao", "descricao_situacao", "status") as string | null,
          cidade_veiculo: (g(v, "cidade", "cidade_veiculo") as string | null) || assocE?.cidade || null,
          estado: (g(v, "estado", "uf") as string | null) || assocE?.estado || null,
          voluntario: g(v, "voluntario") as string | null,
          // Demografia do associado (Sexo / Estado Civil / Faixa Etária no BI)
          sexo: normalizaSexo(g(v, "sexo", "sexo_associado")) || assocE?.sexo || null,
          estado_civil: (g(v, "estado_civil", "estado_civil_associado") as string | null) || assocE?.estado_civil || null,
          idade_associado:
            int(g(v, "idade_associado", "idade")) ??
            idadeFromNascimento(g(v, "data_nascimento", "nascimento") as string | null) ??
            assocE?.idade ??
            null,
        };
      });

      const nomeArqB = `API base ${ddmmyyyy(new Date())}`;

      // grava Cadastro — desativa a importação anterior ANTES de inserir a nova
      // (constraint uq_cadastro_importacoes_ativo permite só uma ativa por associação)
      await supabase
        .from("cadastro_importacoes")
        .update({ ativo: false })
        .eq("corretora_id", corretora_id)
        .eq("ativo", true);
      const { data: impCad, error: impCadErr } = await supabase
        .from("cadastro_importacoes")
        .insert({ nome_arquivo: nomeArqB, total_registros: cadastro.length, corretora_id, ativo: true })
        .select("id")
        .single();
      if (impCadErr) throw new Error(`Erro import Cadastro: ${impCadErr.message}`);
      for (let i = 0; i < cadastro.length; i += 500) {
        const lote = cadastro.slice(i, i + 500).map((r) => ({ ...r, importacao_id: impCad.id }));
        const { error } = await supabase.from("cadastro_registros").insert(lote);
        if (error) throw new Error(`Erro inserir Cadastro (lote ${i}): ${error.message}`);
      }

      // grava Estudo de Base — desativa a anterior ANTES de inserir a nova
      await supabase
        .from("estudo_base_importacoes")
        .update({ ativo: false })
        .eq("corretora_id", corretora_id)
        .eq("ativo", true);
      const { data: impEb, error: impEbErr } = await supabase
        .from("estudo_base_importacoes")
        .insert({ nome_arquivo: nomeArqB, total_registros: eb.length, corretora_id, ativo: true })
        .select("id")
        .single();
      if (impEbErr) throw new Error(`Erro import Estudo de Base: ${impEbErr.message}`);
      for (let i = 0; i < eb.length; i += 500) {
        const lote = eb.slice(i, i + 500).map((r) => ({ ...r, importacao_id: impEb.id }));
        const { error } = await supabase.from("estudo_base_registros").insert(lote);
        if (error) throw new Error(`Erro inserir Estudo de Base (lote ${i}): ${error.message}`);
      }

      // dispara a agregação (cálculo no nosso sistema) → pid_estudo_base do mês
      let agregacao: unknown = null;
      try {
        const aggRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/agregar-estudo-base`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ corretora_id }),
        });
        agregacao = await aggRes.json().catch(() => null);
      } catch (err) {
        console.warn("[importar-api-hinova] Falha ao agregar Estudo de Base:", err);
      }

      // NOTA: Cadastro/Estudo de Base ainda seguem o padrão antigo (substituição
      // total a cada importação) — não fazem parte do escopo deste ajuste, que
      // cobriu especificamente Cobrança, MGF e Eventos (onde o histórico estava
      // sendo perdido a cada execução via API).
      return new Response(
        JSON.stringify({
          success: true,
          modulo: "base",
          via: "api",
          endpoint: endpointOk,
          tentativas,
          total: veiculos.length,
          cadastro: cadastro.length,
          estudo_base: eb.length,
          agregacao,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ================= COBRANÇA (boletos) =================
    if (modulo === "cobranca") {
      const hojeC = new Date();
      const fimC = body.data_fim ? parseBR(body.data_fim) || hojeC : hojeC;
      const inicioC = body.data_inicio ? parseBR(body.data_inicio) || addDays(fimC, -540) : addDays(fimC, -540);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = [];
      let cursorC = new Date(inicioC),
        janelasC = 0;
      while (cursorC <= fimC && janelasC < 40) {
        const janFim = addDays(cursorC, 30) > fimC ? fimC : addDays(cursorC, 30); // <=31 dias
        janelasC++;
        const r = await fetch(`${base}/listar/boleto-associado/periodo`, {
          method: "POST",
          headers: H,
          body: JSON.stringify({ data_vencimento_inicial: ddmmyyyy(cursorC), data_vencimento_final: ddmmyyyy(janFim) }),
        });
        const j = await r.json().catch(() => null);
        const boletos = Array.isArray(j?.boletos) ? j.boletos : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const b of boletos as any[]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const veics: any[] = Array.isArray(b.veiculos) ? b.veiculos : [];
          const placas =
            veics
              .map((v) => v.placa)
              .filter(Boolean)
              .join(", ") || null;
          rows.push({
            nome: b.nome_associado || null,
            valor: num(b.valor_boleto),
            data_vencimento: dateISO(b.data_vencimento),
            data_vencimento_original: dateISO(b.data_vencimento_original),
            data_pagamento: dateISO(b.data_pagamento),
            situacao: b.situacao_boleto || null,
            placas,
            dados_extras: {
              nosso_numero: b.nosso_numero,
              cpf: b.cpf,
              valor_pagamento: b.valor_pagamento,
              tipo_boleto: b.tipo_boleto,
              codigo_banco: b.codigo_banco,
              mes_referente: b.mes_referente,
              data_emissao: b.data_emissao,
              codigo_forma_pagamento: b.codigo_forma_pagamento,
              codigo_regional: veics[0]?.codigo_regional,
              codigo_cooperativa: veics[0]?.codigo_cooperativa,
              codigo_voluntario: veics[0]?.codigo_voluntario,
            },
          });
        }
        cursorC = addDays(janFim, 1);
      }

      // Reaproveita a importação ATIVA existente em vez de criar uma nova e
      // desativar a anterior — só assim o histórico fora desta janela (ex.:
      // boletos antigos de uma importação manual) não é perdido a cada rodada.
      const nomeArqC = `API cobrança ${ddmmyyyy(inicioC)}–${ddmmyyyy(fimC)}`;
      const { id: impCId } = await getOrCreateImportacaoAtiva(supabase, "cobranca_importacoes", corretora_id, nomeArqC);

      const mergeResC = await mergeIncremental(
        supabase,
        "cobranca_boletos",
        impCId,
        rows,
        (row) => (row?.dados_extras?.nosso_numero ? String(row.dados_extras.nosso_numero) : null),
        "id, dados_extras",
      );

      const { count: totalC } = await supabase
        .from("cobranca_boletos")
        .select("id", { count: "exact", head: true })
        .eq("importacao_id", impCId);
      await supabase
        .from("cobranca_importacoes")
        .update({ total_registros: totalC ?? mergeResC.totalProcessado })
        .eq("id", impCId);

      await supabase
        .from("cobranca_automacao_config")
        .update({
          ultimo_status: "sucesso",
          ultimo_erro: null,
          ultima_execucao: new Date().toISOString(),
          ultima_origem: "api",
        })
        .eq("corretora_id", corretora_id);
      return new Response(
        JSON.stringify({
          success: true,
          modulo: "cobranca",
          total: totalC ?? mergeResC.totalProcessado,
          novos: mergeResC.novos,
          atualizados: mergeResC.atualizados,
          janelas: janelasC,
          importacao_id: impCId,
          via: "api",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ================= MGF (lançamentos financeiros) =================
    if (modulo === "mgf") {
      const hojeM = new Date();
      const fimM = body.data_fim ? parseBR(body.data_fim) || hojeM : hojeM;
      const inicioM = body.data_inicio ? parseBR(body.data_inicio) || addDays(fimM, -540) : addDays(fimM, -540);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = [];
      const PAGE = 1000;
      let inicioPag = 0,
        paginas = 0;
      while (paginas < 100) {
        paginas++;
        const r = await fetch(`${base}/mgf-lancamento/listar`, {
          method: "POST",
          headers: H,
          body: JSON.stringify({
            data_vencimento_inicial: ddmmyyyy(inicioM),
            data_vencimento_final: ddmmyyyy(fimM),
            quantidade_por_pagina: PAGE,
            inicio_paginacao: inicioPag,
          }),
        });
        const j = await r.json().catch(() => null);
        const lancs = Array.isArray(j?.retorno) ? j.retorno : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const L of lancs as any[]) {
          const parcelas = Array.isArray(L.parcelas) ? L.parcelas : [L];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const P of parcelas as any[]) {
            rows.push({
              operacao: P.operacao ?? null,
              sub_operacao: P.suboperacao ?? null,
              descricao: P.descricao ?? null,
              situacao_pagamento: P.situacao ?? null,
              fornecedor: P.fornecedor || null,
              forma_pagamento: P.documento || null,
              data_vencimento: dateISO(P.data_vencimento),
              data_pagamento: dateISO(P.data_pagamento),
              valor: num(P.valor_parcela),
              valor_pagamento: num(P.valor_pago),
              multa: num(P.multa),
              juros: num(P.juros),
              nota_fiscal: L.nota_fiscal ? String(L.nota_fiscal) : null,
              controle_interno: L.controle_interno || null,
              protocolo_evento: L.protocolo_evento ? String(L.protocolo_evento) : null,
              valor_total_lancamento: num(L.valor_base),
              data_nota_fiscal: dateISO(L.data_emissao_nota_fiscal),
              quantidade_parcela: int(L.quantidade_parcela),
              dados_extras: {
                codigo_lancamento: L.codigo_lancamento,
                codigo_associado: L.codigo_associado,
                codigo_veiculo: L.codigo_veiculo,
                codigo_regional: L.codigo_regional,
                codigo_cooperativa: L.codigo_cooperativa,
                codigo_departamento: L.codigo_departamento,
                codigo_voluntario: L.codigo_voluntario,
                codigo_terceiro: L.codigo_terceiro,
                parcela: P.parcela,
                desconto: P.desconto,
                cliente: P.cliente,
              },
            });
          }
        }
        if (lancs.length < PAGE) break;
        inicioPag += PAGE;
      }

      // Mesmo princípio de Cobrança/Eventos: reaproveita a importação ativa,
      // nunca cria uma nova que apague o histórico anterior.
      const nomeArqM = `API MGF ${ddmmyyyy(inicioM)}–${ddmmyyyy(fimM)}`;
      const { id: impMId } = await getOrCreateImportacaoAtiva(supabase, "mgf_importacoes", corretora_id, nomeArqM);

      const mergeResM = await mergeIncremental(
        supabase,
        "mgf_dados",
        impMId,
        rows,
        (row) =>
          row?.dados_extras?.codigo_lancamento && row?.dados_extras?.parcela
            ? `${row.dados_extras.codigo_lancamento}_${row.dados_extras.parcela}`
            : null,
        "id, dados_extras",
      );

      const { count: totalM } = await supabase
        .from("mgf_dados")
        .select("id", { count: "exact", head: true })
        .eq("importacao_id", impMId);
      await supabase
        .from("mgf_importacoes")
        .update({ total_registros: totalM ?? mergeResM.totalProcessado })
        .eq("id", impMId);

      await supabase
        .from("mgf_automacao_config")
        .update({
          ultimo_status: "sucesso",
          ultimo_erro: null,
          ultima_execucao: new Date().toISOString(),
          ultima_origem: "api",
        })
        .eq("corretora_id", corretora_id);
      return new Response(
        JSON.stringify({
          success: true,
          modulo: "mgf",
          total: totalM ?? mergeResM.totalProcessado,
          novos: mergeResM.novos,
          atualizados: mergeResM.atualizados,
          paginas,
          importacao_id: impMId,
          via: "api",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2) Janela de datas (default: últimos 18 meses). data_cadastro/data_cadastro_final, máx 30 dias por janela.
    const hoje = new Date();
    const fim = body.data_fim ? parseBR(body.data_fim) || hoje : hoje;
    const inicio = body.data_inicio ? parseBR(body.data_inicio) || addDays(fim, -540) : addDays(fim, -540);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const porCodigo = new Map<string, any>();
    let janelas = 0;
    let cursor = new Date(inicio);
    while (cursor <= fim && janelas < 40) {
      const janelaFim = addDays(cursor, 29) > fim ? fim : addDays(cursor, 29);
      janelas++;
      const r = await fetch(`${base}/listar/evento`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({ data_cadastro: ddmmyyyy(cursor), data_cadastro_final: ddmmyyyy(janelaFim) }),
      });
      const j = await r.json().catch(() => null);
      const arr = Array.isArray(j) ? j : [];
      for (const ev of arr) {
        const chave = String(ev.codigo_evento ?? ev.codigo ?? ev.protocolo ?? Math.random());
        porCodigo.set(chave, ev);
      }
      cursor = addDays(janelaFim, 1);
    }

    // 3) Mapear -> sga_eventos
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventos = Array.from(porCodigo.values()).map((ev: any) => {
      const vec = ev.veiculo || {};
      return {
        situacao_evento: ev.situacao_evento ?? null,
        tipo_evento: ev.evento_tipo ?? null,
        motivo_evento: ev.motivo ?? null,
        envolvimento: ev.envolvimento ?? null,
        passivel_ressarcimento: ev.passivel_ressarcimento || null,
        solicitou_carro_reserva: ev.solicitou_carro_reserva ?? null,
        protocolo: ev.protocolo ? String(ev.protocolo) : null,
        numero_bo: ev.numero_bo || null,
        data_cadastro_item: dateISO(ev.data_cadastro),
        data_cadastro_evento: dateISO(ev.data_cadastro),
        data_evento: dateISO(ev.data_evento),
        valor_reparo: num(ev.valor_reparo),
        previsao_valor_reparo: num(ev.previsao_valor_reparo),
        participacao: num(ev.participacao),
        evento_cidade: ev.cidade || null,
        evento_logradouro: ev.logradouro || null,
        regional: ev.regional || null,
        cooperativa: ev.cooperativa || null,
        voluntario: ev.voluntario || null,
        // veículo (objeto aninhado)
        placa: vec.placa || null,
        modelo_veiculo: vec.modelo || null,
        ano_fabricacao: int(vec.ano_fabricacao),
        categoria_veiculo: vec.categoria || null,
        valor_protegido_veiculo: num(vec.valor_fipe),
      };
    });

    // 4) Reaproveita a importação ATIVA existente (mesmo princípio de Cobrança
    // e MGF acima) — antes disso, cada execução criava uma importação nova e
    // desativava a anterior, o que apagava (na prática) todo o histórico fora
    // da janela de ~18 meses buscada agora. Agora só criamos uma nova na
    // primeiríssima execução; das próximas em diante, só inserimos o que é
    // novo e substituímos (delete+insert) o que já existia e mudou.
    const nomeArquivo = `API eventos ${ddmmyyyy(inicio)}–${ddmmyyyy(fim)}`;
    const { id: impId } = await getOrCreateImportacaoAtiva(supabase, "sga_importacoes", corretora_id, nomeArquivo);

    const mergeRes = await mergeIncremental(
      supabase,
      "sga_eventos",
      impId,
      eventos,
      (row) => (row?.protocolo ? String(row.protocolo) : null),
      "id, protocolo",
    );

    // 5) Atualiza total_registros da importação e a config
    const { count: totalEventos } = await supabase
      .from("sga_eventos")
      .select("id", { count: "exact", head: true })
      .eq("importacao_id", impId);
    await supabase
      .from("sga_importacoes")
      .update({ total_registros: totalEventos ?? mergeRes.totalProcessado })
      .eq("id", impId);

    await supabase
      .from("sga_automacao_config")
      .update({
        ultimo_status: "sucesso",
        ultimo_erro: null,
        ultima_execucao: new Date().toISOString(),
        ultima_origem: "api",
      })
      .eq("corretora_id", corretora_id);

    return new Response(
      JSON.stringify({
        success: true,
        modulo: "eventos",
        total: totalEventos ?? mergeRes.totalProcessado,
        novos: mergeRes.novos,
        atualizados: mergeRes.atualizados,
        janelas,
        importacao_id: impId,
        via: "api",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    console.error("[importar-api-hinova]", msg);
    await persistApiError(supabase, modulo, corretora_id, msg);
    return new Response(JSON.stringify({ success: false, message: msg }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
