// lovable-deploy: deploy nudge 2026-07-04T15:18:37Z
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const corretora_id: string = body.corretora_id;
    const modulo: string = body.modulo || "eventos";
    if (!corretora_id) {
      return new Response(JSON.stringify({ success: false, message: "corretora_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      return new Response(JSON.stringify({ success: false, message: `Módulo '${modulo}' ainda não implementado na API` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ================= BASE (veículos/associados) → Cadastro + Estudo de Base =================
    if (modulo === "base") {
      // Auto-descoberta do endpoint de listagem (a doc da Hinova é fechada; tenta candidatos
      // e usa o primeiro que responder um array de veículos). O endpoint vencedor é retornado
      // para consolidarmos após a 1ª validação.
      const candidatos: { path: string; method: "GET" | "POST"; body?: unknown }[] = [
        { path: "/listar/veiculos/associados", method: "POST", body: {} },
        { path: "/listar/veiculo-associado", method: "POST", body: {} },
        { path: "/listar/veiculo/associado", method: "POST", body: {} },
        { path: "/listar/veiculo", method: "POST", body: {} },
        { path: "/listar/associado", method: "POST", body: {} },
        { path: "/veiculos", method: "GET" },
      ];
      // extrai um array de veículos de formatos variados de resposta
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extrairArray = (j: any): any[] | null => {
        if (Array.isArray(j)) return j;
        if (!j || typeof j !== "object") return null;
        for (const k of ["veiculos", "associados", "dados", "data", "registros", "resultado", "lista"]) {
          if (Array.isArray(j[k])) return j[k];
        }
        return null;
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let veiculos: any[] | null = null;
      let endpointOk: string | null = null;
      const tentativas: string[] = [];
      for (const c of candidatos) {
        try {
          const r = await fetch(`${base}${c.path}`, {
            method: c.method,
            headers: H,
            body: c.method === "POST" ? JSON.stringify(c.body ?? {}) : undefined,
          });
          const j = await r.json().catch(() => null);
          const arr = extrairArray(j);
          tentativas.push(`${c.method} ${c.path} → ${r.status}${arr ? ` (${arr.length})` : ""}`);
          if (r.ok && arr && arr.length > 0) { veiculos = arr; endpointOk = `${c.method} ${c.path}`; break; }
          if (r.ok && arr && veiculos === null) { veiculos = arr; endpointOk = `${c.method} ${c.path}`; } // guarda array vazio como fallback
        } catch (err) {
          tentativas.push(`${c.method} ${c.path} → erro`);
        }
      }

      if (veiculos === null) {
        return new Response(JSON.stringify({
          success: false, modulo: "base",
          message: "Nenhum endpoint de listagem de veículos respondeu. Confirme o endpoint com a Hinova.",
          tentativas,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // helpers de leitura tolerante a nomes de campo
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (o: any, ...keys: string[]): any => {
        for (const k of keys) {
          if (o && o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
          // suporta objeto aninhado "veiculo"/"associado"
          if (o?.veiculo && o.veiculo[k] !== undefined && o.veiculo[k] !== null && o.veiculo[k] !== "") return o.veiculo[k];
          if (o?.associado && o.associado[k] !== undefined && o.associado[k] !== null && o.associado[k] !== "") return o.associado[k];
        }
        return null;
      };

      // Busca associados para preencher CIDADE/ESTADO (o veículo não traz endereço)
      const assocMap = new Map<string, { cidade: string | null; estado: string | null }>();
      try {
        const ar = await fetch(`${base}/listar/associado`, { method: "POST", headers: H, body: JSON.stringify({}) });
        const aj = await ar.json().catch(() => null);
        const aarr = extrairArray(aj) || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const a of aarr as any[]) {
          const cod = String(a.codigo_associado ?? a.codigo ?? "");
          if (cod) assocMap.set(cod, { cidade: (a.cidade ?? a.cidade_associado ?? null), estado: (a.estado ?? a.uf ?? null) });
        }
      } catch (_e) { /* segue sem cidade/estado */ }

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
        ano_veiculo: (g(v, "ano_modelo", "ano_fabricacao", "ano") ?? null) ? String(g(v, "ano_modelo", "ano_fabricacao", "ano")) : null,
        situacao: g(v, "situacao", "situacao_veiculo", "status") as string | null,
        regional: g(v, "regional") as string | null,
        cooperativa: g(v, "cooperativa") as string | null,
        data_cadastro: dateISO(g(v, "data_cadastro", "data_contrato")),
        data_adesao: dateISO(g(v, "data_adesao", "data_contrato")),
        valor_protegido: num(g(v, "valor_protegido", "valor_fipe")),
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
        valor_protegido: num(g(v, "valor_protegido")),
        valor_fipe: num(g(v, "valor_fipe", "valor_protegido")),
        cooperativa: g(v, "cooperativa") as string | null,
        regional: g(v, "regional") as string | null,
        situacao_veiculo: g(v, "situacao_veiculo", "situacao", "status") as string | null,
        cidade_veiculo: (g(v, "cidade", "cidade_veiculo") as string | null) || assocE?.cidade || null,
        estado: (g(v, "estado", "uf") as string | null) || assocE?.estado || null,
        voluntario: g(v, "voluntario") as string | null,
        };
      });

      const nomeArqB = `API base ${ddmmyyyy(new Date())}`;

      // grava Cadastro
      const { data: impCad, error: impCadErr } = await supabase
        .from("cadastro_importacoes")
        .insert({ nome_arquivo: nomeArqB, total_registros: cadastro.length, corretora_id, ativo: true })
        .select("id").single();
      if (impCadErr) throw new Error(`Erro import Cadastro: ${impCadErr.message}`);
      await supabase.from("cadastro_importacoes").update({ ativo: false }).eq("corretora_id", corretora_id).neq("id", impCad.id);
      for (let i = 0; i < cadastro.length; i += 500) {
        const lote = cadastro.slice(i, i + 500).map((r) => ({ ...r, importacao_id: impCad.id }));
        const { error } = await supabase.from("cadastro_registros").insert(lote);
        if (error) throw new Error(`Erro inserir Cadastro (lote ${i}): ${error.message}`);
      }

      // grava Estudo de Base
      const { data: impEb, error: impEbErr } = await supabase
        .from("estudo_base_importacoes")
        .insert({ nome_arquivo: nomeArqB, total_registros: eb.length, corretora_id, ativo: true })
        .select("id").single();
      if (impEbErr) throw new Error(`Erro import Estudo de Base: ${impEbErr.message}`);
      await supabase.from("estudo_base_importacoes").update({ ativo: false }).eq("corretora_id", corretora_id).neq("id", impEb.id);
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
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({ corretora_id }),
        });
        agregacao = await aggRes.json().catch(() => null);
      } catch (err) {
        console.warn("[importar-api-hinova] Falha ao agregar Estudo de Base:", err);
      }

      return new Response(JSON.stringify({
        success: true, modulo: "base", via: "api",
        endpoint: endpointOk, tentativas,
        total: veiculos.length, cadastro: cadastro.length, estudo_base: eb.length,
        agregacao,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ================= COBRANÇA (boletos) =================
    if (modulo === "cobranca") {
      const hojeC = new Date();
      const fimC = body.data_fim ? parseBR(body.data_fim) || hojeC : hojeC;
      const inicioC = body.data_inicio ? parseBR(body.data_inicio) || addDays(fimC, -540) : addDays(fimC, -540);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = [];
      let cursorC = new Date(inicioC), janelasC = 0;
      while (cursorC <= fimC && janelasC < 40) {
        const janFim = addDays(cursorC, 30) > fimC ? fimC : addDays(cursorC, 30); // <=31 dias
        janelasC++;
        const r = await fetch(`${base}/listar/boleto-associado/periodo`, {
          method: "POST", headers: H,
          body: JSON.stringify({ data_vencimento_inicial: ddmmyyyy(cursorC), data_vencimento_final: ddmmyyyy(janFim) }),
        });
        const j = await r.json().catch(() => null);
        const boletos = Array.isArray(j?.boletos) ? j.boletos : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const b of boletos as any[]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const veics: any[] = Array.isArray(b.veiculos) ? b.veiculos : [];
          const placas = veics.map((v) => v.placa).filter(Boolean).join(", ") || null;
          rows.push({
            nome: b.nome_associado || null,
            valor: num(b.valor_boleto),
            data_vencimento: dateISO(b.data_vencimento),
            data_vencimento_original: dateISO(b.data_vencimento_original),
            data_pagamento: dateISO(b.data_pagamento),
            situacao: b.situacao_boleto || null,
            placas,
            dados_extras: {
              nosso_numero: b.nosso_numero, cpf: b.cpf, valor_pagamento: b.valor_pagamento,
              tipo_boleto: b.tipo_boleto, codigo_banco: b.codigo_banco, mes_referente: b.mes_referente,
              data_emissao: b.data_emissao, codigo_forma_pagamento: b.codigo_forma_pagamento,
              codigo_regional: veics[0]?.codigo_regional, codigo_cooperativa: veics[0]?.codigo_cooperativa,
              codigo_voluntario: veics[0]?.codigo_voluntario,
            },
          });
        }
        cursorC = addDays(janFim, 1);
      }

      const nomeArqC = `API cobrança ${ddmmyyyy(inicioC)}–${ddmmyyyy(fimC)}`;
      const { data: impC, error: impErrC } = await supabase
        .from("cobranca_importacoes")
        .insert({ nome_arquivo: nomeArqC, total_registros: rows.length, corretora_id, ativo: true })
        .select("id").single();
      if (impErrC) throw new Error(`Erro ao criar importação cobrança: ${impErrC.message}`);
      await supabase.from("cobranca_importacoes").update({ ativo: false }).eq("corretora_id", corretora_id).neq("id", impC.id);
      if (rows.length > 0) {
        const comImp = rows.map((x) => ({ ...x, importacao_id: impC.id }));
        for (let i = 0; i < comImp.length; i += 500) {
          const { error: insErrC } = await supabase.from("cobranca_boletos").insert(comImp.slice(i, i + 500));
          if (insErrC) throw new Error(`Erro ao inserir cobranca_boletos (lote ${i}): ${insErrC.message}`);
        }
      }
      await supabase.from("cobranca_automacao_config").update({
        ultimo_status: "sucesso", ultimo_erro: null, ultima_execucao: new Date().toISOString(), ultima_origem: "api",
      }).eq("corretora_id", corretora_id);
      return new Response(JSON.stringify({ success: true, modulo: "cobranca", total: rows.length, janelas: janelasC, importacao_id: impC.id, via: "api" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ================= MGF (lançamentos financeiros) =================
    if (modulo === "mgf") {
      const hojeM = new Date();
      const fimM = body.data_fim ? parseBR(body.data_fim) || hojeM : hojeM;
      const inicioM = body.data_inicio ? parseBR(body.data_inicio) || addDays(fimM, -540) : addDays(fimM, -540);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = [];
      const PAGE = 1000;
      let inicioPag = 0, paginas = 0;
      while (paginas < 100) {
        paginas++;
        const r = await fetch(`${base}/mgf-lancamento/listar`, {
          method: "POST", headers: H,
          body: JSON.stringify({ data_vencimento_inicial: ddmmyyyy(inicioM), data_vencimento_final: ddmmyyyy(fimM), quantidade_por_pagina: PAGE, inicio_paginacao: inicioPag }),
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
                codigo_lancamento: L.codigo_lancamento, codigo_associado: L.codigo_associado,
                codigo_veiculo: L.codigo_veiculo, codigo_regional: L.codigo_regional,
                codigo_cooperativa: L.codigo_cooperativa, codigo_departamento: L.codigo_departamento,
                codigo_voluntario: L.codigo_voluntario, codigo_terceiro: L.codigo_terceiro,
                parcela: P.parcela, desconto: P.desconto, cliente: P.cliente,
              },
            });
          }
        }
        if (lancs.length < PAGE) break;
        inicioPag += PAGE;
      }

      const nomeArqM = `API MGF ${ddmmyyyy(inicioM)}–${ddmmyyyy(fimM)}`;
      const { data: impM, error: impErrM } = await supabase
        .from("mgf_importacoes")
        .insert({ nome_arquivo: nomeArqM, total_registros: rows.length, corretora_id, ativo: true })
        .select("id").single();
      if (impErrM) throw new Error(`Erro ao criar importação MGF: ${impErrM.message}`);
      await supabase.from("mgf_importacoes").update({ ativo: false }).eq("corretora_id", corretora_id).neq("id", impM.id);
      if (rows.length > 0) {
        const comImp = rows.map((x) => ({ ...x, importacao_id: impM.id }));
        for (let i = 0; i < comImp.length; i += 500) {
          const { error: insErrM } = await supabase.from("mgf_dados").insert(comImp.slice(i, i + 500));
          if (insErrM) throw new Error(`Erro ao inserir mgf_dados (lote ${i}): ${insErrM.message}`);
        }
      }
      await supabase.from("mgf_automacao_config").update({
        ultimo_status: "sucesso", ultimo_erro: null, ultima_execucao: new Date().toISOString(), ultima_origem: "api",
      }).eq("corretora_id", corretora_id);
      return new Response(JSON.stringify({ success: true, modulo: "mgf", total: rows.length, paginas, importacao_id: impM.id, via: "api" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    // 4) Gravar importação + eventos (mesmas tabelas do crawl)
    const nomeArquivo = `API eventos ${ddmmyyyy(inicio)}–${ddmmyyyy(fim)}`;
    const { data: imp, error: impErr } = await supabase
      .from("sga_importacoes")
      .insert({ nome_arquivo: nomeArquivo, total_registros: eventos.length, corretora_id, ativo: true })
      .select("id")
      .single();
    if (impErr) throw new Error(`Erro ao criar importação: ${impErr.message}`);

    // desativa importações anteriores
    await supabase.from("sga_importacoes").update({ ativo: false }).eq("corretora_id", corretora_id).neq("id", imp.id);

    // insere em lotes
    if (eventos.length > 0) {
      const comImp = eventos.map((e) => ({ ...e, importacao_id: imp.id }));
      for (let i = 0; i < comImp.length; i += 500) {
        const lote = comImp.slice(i, i + 500);
        const { error: insErr } = await supabase.from("sga_eventos").insert(lote);
        if (insErr) throw new Error(`Erro ao inserir eventos (lote ${i}): ${insErr.message}`);
      }
    }

    // 5) Atualiza config
    await supabase.from("sga_automacao_config").update({
      ultimo_status: "sucesso",
      ultimo_erro: null,
      ultima_execucao: new Date().toISOString(),
      ultima_origem: "api",
    }).eq("corretora_id", corretora_id);

    return new Response(JSON.stringify({ success: true, modulo: "eventos", total: eventos.length, janelas, importacao_id: imp.id, via: "api" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    console.error("[importar-api-hinova]", msg);
    return new Response(JSON.stringify({ success: false, message: msg }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});