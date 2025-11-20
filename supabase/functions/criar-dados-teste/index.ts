import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid user' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Limpando dados de teste...');

    // Limpar dados de teste (apenas vistorias e atendimentos de teste)
    await supabase.from('andamentos').delete().like('descricao', '%TESTE%');
    await supabase.from('vistorias').delete().like('cliente_nome', '%Teste%');
    await supabase.from('atendimentos').delete().like('assunto', '%TESTE%');

    console.log('Criando dados de teste...');

    // Buscar fluxo ativo
    const { data: fluxo } = await supabase
      .from('fluxos')
      .select('id, nome')
      .eq('ativo', true)
      .limit(1)
      .single();

    if (!fluxo) {
      throw new Error('Nenhum fluxo ativo encontrado');
    }

    // Buscar primeiro status do fluxo
    const { data: primeiroStatus } = await supabase
      .from('status_config')
      .select('nome')
      .eq('fluxo_id', fluxo.id)
      .eq('ativo', true)
      .order('ordem')
      .limit(1)
      .single();

    if (!primeiroStatus) {
      throw new Error('Nenhum status encontrado para o fluxo');
    }

    // Buscar corretora
    const { data: corretora } = await supabase
      .from('corretoras')
      .select('id')
      .limit(1)
      .single();

    const dadosTeste = [
      {
        cliente: {
          nome: 'João Silva Teste',
          cpf: '12345678901',
          email: 'joao.teste@email.com',
          telefone: '11987654321'
        },
        veiculo: {
          placa: 'ABC-1234',
          marca: 'Toyota',
          modelo: 'Corolla',
          ano: '2020',
          cor: 'Prata'
        },
        sinistro: 'Colisão traseira no estacionamento',
        andamentos: [
          'Sinistro registrado - aguardando vistoria',
          'Vistoria agendada para amanhã',
          'Documentação inicial recebida'
        ]
      },
      {
        cliente: {
          nome: 'Maria Santos Teste',
          cpf: '98765432109',
          email: 'maria.teste@email.com',
          telefone: '11976543210'
        },
        veiculo: {
          placa: 'XYZ-5678',
          marca: 'Honda',
          modelo: 'Civic',
          ano: '2021',
          cor: 'Preto'
        },
        sinistro: 'Danos na lateral direita - batida',
        andamentos: [
          'Atendimento iniciado',
          'Documentos solicitados ao cliente',
          'Análise em andamento'
        ]
      },
      {
        cliente: {
          nome: 'Pedro Oliveira Teste',
          cpf: '45678912345',
          email: 'pedro.teste@email.com',
          telefone: '11965432109'
        },
        veiculo: {
          placa: 'DEF-9012',
          marca: 'Volkswagen',
          modelo: 'Gol',
          ano: '2019',
          cor: 'Branco'
        },
        sinistro: 'Quebra de para-brisa',
        andamentos: [
          'Caso aberto',
          'Perito designado',
          'Vistoria realizada'
        ]
      },
      {
        cliente: {
          nome: 'Ana Costa Teste',
          cpf: '78912345678',
          email: 'ana.teste@email.com',
          telefone: '11954321098'
        },
        veiculo: {
          placa: 'GHI-3456',
          marca: 'Chevrolet',
          modelo: 'Onix',
          ano: '2022',
          cor: 'Vermelho'
        },
        sinistro: 'Alagamento - enchente',
        andamentos: [
          'Sinistro registrado com urgência',
          'Reboque solicitado',
          'Veículo em oficina credenciada'
        ]
      },
      {
        cliente: {
          nome: 'Carlos Mendes Teste',
          cpf: '32165498732',
          email: 'carlos.teste@email.com',
          telefone: '11943210987'
        },
        veiculo: {
          placa: 'JKL-7890',
          marca: 'Fiat',
          modelo: 'Argo',
          ano: '2023',
          cor: 'Azul'
        },
        sinistro: 'Furto de espelhos retrovisores',
        andamentos: [
          'Boletim de ocorrência anexado',
          'Em análise para aprovação',
          'Orçamento solicitado'
        ]
      }
    ];

    const criadosComSucesso = [];

    for (const dado of dadosTeste) {
      // Criar atendimento
      const { data: atendimento, error: atendimentoError } = await supabase
        .from('atendimentos')
        .insert({
          user_id: user.id,
          corretora_id: corretora?.id,
          assunto: `TESTE: ${dado.sinistro}`,
          prioridade: 'Alta',
          status: primeiroStatus.nome,
          fluxo_id: fluxo.id,
          observacoes: 'Registro criado para teste do sistema de acompanhamento'
        })
        .select()
        .single();

      if (atendimentoError) {
        console.error('Erro ao criar atendimento:', atendimentoError);
        continue;
      }

      // Criar vistoria
      const { data: vistoria, error: vistoriaError } = await supabase
        .from('vistorias')
        .insert({
          created_by: user.id,
          atendimento_id: atendimento.id,
          corretora_id: corretora?.id,
          tipo_vistoria: 'sinistro',
          tipo_abertura: 'manual',
          status: 'em_andamento',
          cliente_nome: dado.cliente.nome,
          cliente_cpf: dado.cliente.cpf,
          cliente_email: dado.cliente.email,
          cliente_telefone: dado.cliente.telefone,
          veiculo_placa: dado.veiculo.placa,
          veiculo_marca: dado.veiculo.marca,
          veiculo_modelo: dado.veiculo.modelo,
          veiculo_ano: dado.veiculo.ano,
          veiculo_cor: dado.veiculo.cor,
          relato_incidente: dado.sinistro
        })
        .select()
        .single();

      if (vistoriaError) {
        console.error('Erro ao criar vistoria:', vistoriaError);
        continue;
      }

      // Criar andamentos
      for (const andamento of dado.andamentos) {
        await supabase
          .from('andamentos')
          .insert({
            atendimento_id: atendimento.id,
            created_by: user.id,
            descricao: andamento
          });
      }

      criadosComSucesso.push({
        protocolo: vistoria.numero,
        cliente: dado.cliente.nome,
        placa: dado.veiculo.placa,
        cpf: dado.cliente.cpf
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `${criadosComSucesso.length} registros de teste criados com sucesso`,
        registros: criadosComSucesso
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);
