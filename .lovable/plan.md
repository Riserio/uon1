## Melhorias no Módulo de Contratos (inspirado no Clicksign)

### 1. Editar contrato antes de assinar
- Em `GestaoContratos.tsx`, adicionar botão **"Editar"** (ícone Pencil) visível somente quando `status === "rascunho"` ou `aguardando_assinatura` (desde que nenhuma assinatura tenha sido coletada ainda).
- Reaproveitar o `NovoContratoDialog` em modo edição: aceitar prop opcional `contrato` para pré-preencher campos, signatários e conteúdo. Ao salvar, faz `UPDATE` em `contratos` + reconcilia `contrato_assinaturas` (apaga as pendentes e recria conforme nova lista; mantém as já assinadas intocadas).
- Bloquear edição quando já houver assinatura coletada, mostrando aviso "Contrato já possui assinaturas — não pode mais ser editado".

### 2. Dados da Contratada espelhando o Signatário
- Hoje só existe bloco "Dados do Signatário" (contratante) e seleção de associação. Criar novo bloco **"Dados da Contratada"** com os mesmos campos: Tipo (PF/PJ), Nome/Razão Social, CPF/CNPJ, E-mail, Telefone, Endereço, Representante legal (quando PJ).
- Toggle **"Usar associação cadastrada / Informar manualmente"** (igual ao já feito no signatário).
- Toggle adicional **"Assinatura automática"** (default ligado): quando ligado, a contratada NÃO entra na lista de `contrato_assinaturas` e é exibida apenas como parte. Quando desligado, é criada uma assinatura pendente para a contratada (mesmo fluxo do contratante: link próprio, e-mail/WhatsApp, canvas).
- Persistir novos campos em `contratos` (`contratada_*`) via migração.

### 3. Tipo do signatário acompanha o "tipo do contrato"
- No `NovoContratoDialog`, ao selecionar o **Template** (que já tem um campo `tipo`/categoria), pré-selecionar automaticamente o `papel` do primeiro signatário compatível (ex.: template "Locação" → "Locatário"; "MDE/Sociedade" → "Cotista").
- Mapeamento configurável em `src/components/gestao/utils/papeisPorTipoContrato.ts`.
- Usuário pode sobrescrever manualmente.

### 4. Novo tipo de signatário: **Cotista**
- Adicionar `"Cotista"` ao array `PAPEIS_CONTRATANTE` em `NovoContratoDialog.tsx`.
- Incluir também `"Acionista"` e `"Gestora"` (visíveis no documento MDE da imagem) para cobrir o padrão Vangard.

### 5. Visualização do documento na página pública de assinatura
- Em `ContratoAssinatura.tsx`, **substituir** a caixa rolável de texto bruto por:
  - **Resumo enxuto** no topo: título, número, partes (nome + papel), valor, prazo.
  - Botão primário **"Visualizar documento (PDF)"** que abre o `PreviewContratoPDFDialog` em tela cheia (mesmo componente do admin), com o documento renderizado como PDF (logo + formatação A4).
  - Botão secundário **"Baixar PDF"** usando `downloadContratoPDF`.
- Manter a área de assinatura (canvas + checkbox + botão) visível abaixo, sem precisar rolar o texto.
- Checkbox "Li e aceito" só fica habilitado depois que o usuário abrir a visualização do PDF pelo menos uma vez (boa prática Clicksign — garante leitura).

### 6. Logo da Vangard / Associação na página pública de assinatura
- Buscar logo a partir de:
  1. `contrato_templates.logo_url` (já existe relação via `template_id`),
  2. fallback para `corretoras.logo_url` (via `corretora_id`),
  3. fallback final para logo da Uon1.
- Renderizar no header do `ContratoAssinatura.tsx` (esquerda do título) e também no topo do PDF gerado.
- Ajustar `select` do query para trazer `contrato_templates(logo_url, nome)` e `corretoras(logo_url, nome_fantasia)`.

### 7. Polimentos Clicksign-style
- **Stepper** no topo da página pública: `1. Revisar documento → 2. Confirmar dados → 3. Assinar`.
- Card de **"Seus dados"** confirmando nome/CPF/e-mail do signatário antes de assinar (apenas leitura — não editável pelo signatário).
- Badge **"Assinatura eletrônica com validade jurídica (MP 2.200-2/2001)"** no rodapé.
- Exibir **lista de signatários** com status (✓ assinado / ⏳ pendente) — transparência de quem já assinou.
- Após assinar, tela de sucesso com botão **"Baixar via cópia assinada (PDF)"**.

### Migração de banco
Adicionar colunas em `contratos`:
- `contratada_tipo_pessoa` (text), `contratada_nome` (text), `contratada_documento` (text), `contratada_email` (text), `contratada_telefone` (text), `contratada_endereco` (text), `contratada_representante` (text)
- `contratada_assinatura_automatica` (boolean, default true)
- `contratada_manual_mode` (boolean, default false)

### Arquivos a alterar/criar
- **Migração**: nova migration com as colunas acima
- **Editar**: `src/components/gestao/NovoContratoDialog.tsx` (modo edição + bloco contratada + papel automático + Cotista/Acionista/Gestora)
- **Editar**: `src/components/gestao/GestaoContratos.tsx` (botão Editar)
- **Editar**: `src/pages/ContratoAssinatura.tsx` (logo, stepper, preview PDF, lista de signatários, tela de sucesso com download)
- **Editar**: `src/components/gestao/PreviewContratoPDFDialog.tsx` (aceitar prop `logoUrl` e modo público)
- **Criar**: `src/components/gestao/utils/papeisPorTipoContrato.ts`

Não vou mexer na lógica de criação de assinaturas existente — apenas estendê-la para incluir a contratada quando `assinatura_automatica=false`.