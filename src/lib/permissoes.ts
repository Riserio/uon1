/**
 * Regras de permissão de menu — fonte única para sidebar, rotas, abas e telas
 * de cadastro (perfil, cargo e usuário).
 *
 * Precedência (igual à função SQL `user_can_access_menu`):
 *   ajuste individual do usuário  >  cargo  >  perfil de sistema  >  liberado
 *
 * Subitens usam a chave "modulo:subitem" na mesma tabela. Subitem sem registro
 * herda o módulo; módulo sem "ver" bloqueia todos os subitens.
 */
import { supabase } from "@/integrations/supabase/client";
import { MENU_PERMISSION_ITEMS, SUBITENS_MODULO, chavePermissao } from "@/config/modulos";

export interface Permissao {
  pode_visualizar: boolean;
  pode_editar: boolean;
}
export type MapaPermissoes = Record<string, Permissao>;

export const ACESSO_TOTAL_ROLES = ["admin", "superintendente"];

/** Sobrepõe camadas na ordem dada (a última vence). */
export function mesclarPermissoes(...camadas: (MapaPermissoes | undefined | null)[]): MapaPermissoes {
  const out: MapaPermissoes = {};
  for (const c of camadas) {
    if (!c) continue;
    for (const [k, v] of Object.entries(c)) out[k] = { ...v };
  }
  return out;
}

export function linhasParaMapa(
  rows: { menu_item: string; pode_visualizar: boolean; pode_editar: boolean }[] | null | undefined,
): MapaPermissoes {
  const m: MapaPermissoes = {};
  (rows || []).forEach((r) => {
    m[r.menu_item] = { pode_visualizar: r.pode_visualizar, pode_editar: r.pode_editar };
  });
  return m;
}

/** Resolve a permissão efetiva de um módulo (ou subitem) num mapa já mesclado. */
export function resolver(mapa: MapaPermissoes, modulo: string, subitem?: string): Permissao {
  const mod = mapa[modulo] ?? { pode_visualizar: true, pode_editar: true };
  if (!mod.pode_visualizar) return { pode_visualizar: false, pode_editar: false };
  if (!subitem) return mod;
  const sub = mapa[chavePermissao(modulo, subitem)];
  if (!sub) return mod;
  return {
    pode_visualizar: sub.pode_visualizar,
    // não dá para editar um subitem de um módulo só-leitura
    pode_editar: sub.pode_visualizar && sub.pode_editar && mod.pode_editar,
  };
}

/**
 * Mapa "completo" para edição na árvore: todo módulo e subitem com valor
 * explícito, partindo do que está gravado.
 */
export function expandirParaEdicao(gravado: MapaPermissoes, base?: MapaPermissoes): MapaPermissoes {
  const efetivo = mesclarPermissoes(base, gravado);
  const out: MapaPermissoes = {};
  MENU_PERMISSION_ITEMS.forEach((it) => {
    out[it.id] = resolver(efetivo, it.id);
    (SUBITENS_MODULO[it.id] || []).forEach((s) => {
      out[chavePermissao(it.id, s.id)] = resolver(efetivo, it.id, s.id);
    });
  });
  return out;
}

/**
 * Inverso de expandirParaEdicao.
 *
 * Cargo grava TODOS os módulos explicitamente: assim o cargo define o acesso
 * por inteiro e não depende do que o perfil de sistema (role) libera ou não —
 * "vinculou o cargo, vê o que o cargo libera". Subitem só gera linha quando
 * difere do módulo (o resto herda).
 */
export function compactarParaGravar(mapa: MapaPermissoes): MapaPermissoes {
  const out: MapaPermissoes = {};
  MENU_PERMISSION_ITEMS.forEach((it) => {
    const mod = mapa[it.id] ?? { pode_visualizar: true, pode_editar: true };
    out[it.id] = mod;
    if (!mod.pode_visualizar) return; // módulo fechado: subitens irrelevantes
    (SUBITENS_MODULO[it.id] || []).forEach((s) => {
      const k = chavePermissao(it.id, s.id);
      const sub = mapa[k];
      if (!sub) return;
      if (sub.pode_visualizar !== mod.pode_visualizar || sub.pode_editar !== mod.pode_editar) {
        out[k] = sub;
      }
    });
  });
  return out;
}

export async function carregarPermissoesCargo(cargoId: string): Promise<MapaPermissoes> {
  const { data } = await supabase
    .from("cargo_menu_permissions")
    .select("menu_item, pode_visualizar, pode_editar")
    .eq("cargo_id", cargoId);
  return linhasParaMapa(data as any);
}

export async function carregarPermissoesRole(role: string): Promise<MapaPermissoes> {
  const { data } = await supabase
    .from("role_menu_permissions")
    .select("menu_item, pode_visualizar, pode_editar")
    .eq("role", role as any);
  return linhasParaMapa(data as any);
}

export async function salvarPermissoesCargo(cargoId: string, mapaCompleto: MapaPermissoes) {
  const { data: { user } } = await supabase.auth.getUser();
  const compacto = compactarParaGravar(mapaCompleto);
  const { error: delErr } = await supabase.from("cargo_menu_permissions").delete().eq("cargo_id", cargoId);
  if (delErr) throw delErr;
  const linhas = Object.entries(compacto).map(([menu_item, p]) => ({
    cargo_id: cargoId,
    menu_item,
    pode_visualizar: p.pode_visualizar,
    pode_editar: p.pode_editar,
    created_by: user?.id,
  }));
  if (linhas.length > 0) {
    const { error } = await supabase.from("cargo_menu_permissions").insert(linhas);
    if (error) throw error;
  }
}

/** Resumo para exibição: quantos módulos ficam visíveis. */
export function resumoAcesso(mapaEfetivo: MapaPermissoes) {
  const visiveis = MENU_PERMISSION_ITEMS.filter((it) => resolver(mapaEfetivo, it.id).pode_visualizar);
  const somenteLeitura = visiveis.filter((it) => !resolver(mapaEfetivo, it.id).pode_editar);
  return { visiveis, somenteLeitura, total: MENU_PERMISSION_ITEMS.length };
}

/** Ponto de partida de um cargo novo: só o essencial liberado. */
export function permissoesIniciaisCargo(): MapaPermissoes {
  // Configurações começa oculto: liberar dá acesso a ajustes do sistema.
  const essenciais = new Set(["dashboard", "ajuda"]);
  const out: MapaPermissoes = {};
  MENU_PERMISSION_ITEMS.forEach((it) => {
    const p = essenciais.has(it.id)
      ? { pode_visualizar: true, pode_editar: true }
      : { pode_visualizar: false, pode_editar: false };
    out[it.id] = p;
    (SUBITENS_MODULO[it.id] || []).forEach((s) => (out[chavePermissao(it.id, s.id)] = { ...p }));
  });
  return out;
}
