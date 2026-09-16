/**
 * Traduz erros do banco (PostgREST/Postgres) para frases claras em português.
 */
export function mensagemErroBanco(error: any, contexto?: Record<string, string>): string {
  if (!error) return "Ocorreu um erro inesperado.";

  const code: string | undefined = error.code;
  const msg: string = error.message || String(error);

  // Violação de unicidade
  if (code === "23505" || msg.includes("duplicate key value")) {
    const constraint = /constraint "([^"]+)"/.exec(msg)?.[1];
    if (constraint && contexto?.[constraint]) return contexto[constraint];
    if (constraint?.includes("nome")) return "Já existe um registro com esse nome.";
    if (constraint?.includes("email")) return "Já existe um cadastro com esse e-mail.";
    if (constraint?.includes("cpf")) return "Já existe um cadastro com esse CPF/CNPJ.";
    return "Esse registro já existe.";
  }

  // Campo obrigatório
  if (code === "23502" || msg.includes("violates not-null constraint")) {
    const coluna = /column "([^"]+)"/.exec(msg)?.[1];
    return coluna
      ? `O campo "${coluna}" é obrigatório.`
      : "Preencha todos os campos obrigatórios.";
  }

  // Registro em uso (chave estrangeira)
  if (code === "23503" || msg.includes("violates foreign key constraint")) {
    return "Este registro está sendo usado em outro cadastro e não pode ser removido.";
  }

  // Permissão / RLS
  if (code === "42501" || msg.includes("row-level security") || msg.includes("permission denied")) {
    return "Você não tem permissão para realizar esta ação.";
  }

  // Coluna inexistente (schema cache)
  if (code === "PGRST204" || msg.includes("schema cache")) {
    return "Um campo enviado não existe no cadastro. Atualize a página e tente novamente.";
  }

  return msg;
}
