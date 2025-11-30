export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      administradora: {
        Row: {
          cnpj: string | null
          created_at: string | null
          email: string | null
          endereco: string | null
          id: string
          logo_url: string | null
          nome: string
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          logo_url?: string | null
          nome: string
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          logo_url?: string | null
          nome?: string
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      andamentos: {
        Row: {
          atendimento_id: string
          created_at: string
          created_by: string
          descricao: string
          id: string
          updated_at: string
        }
        Insert: {
          atendimento_id: string
          created_at?: string
          created_by: string
          descricao: string
          id?: string
          updated_at?: string
        }
        Update: {
          atendimento_id?: string
          created_at?: string
          created_by?: string
          descricao?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "andamentos_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      api_integrations: {
        Row: {
          ambiente: string
          ativo: boolean | null
          auth_token: string
          base_url: string
          corretora_id: string
          created_at: string
          created_by: string | null
          id: string
          nome: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ambiente?: string
          ativo?: boolean | null
          auth_token: string
          base_url: string
          corretora_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          tipo: string
          updated_at?: string
        }
        Update: {
          ambiente?: string
          ativo?: boolean | null
          auth_token?: string
          base_url?: string
          corretora_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_integrations_corretora_id_fkey"
            columns: ["corretora_id"]
            isOneToOne: false
            referencedRelation: "corretoras"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          colors: Json | null
          created_at: string | null
          id: string
          login_image_url: string | null
          logo_url: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          colors?: Json | null
          created_at?: string | null
          id?: string
          login_image_url?: string | null
          logo_url?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          colors?: Json | null
          created_at?: string | null
          id?: string
          login_image_url?: string | null
          logo_url?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      atendimento_anexos: {
        Row: {
          arquivo_nome: string
          arquivo_tamanho: number | null
          arquivo_url: string
          atendimento_id: string
          created_at: string
          created_by: string
          id: string
          tipo_arquivo: string | null
        }
        Insert: {
          arquivo_nome: string
          arquivo_tamanho?: number | null
          arquivo_url: string
          atendimento_id: string
          created_at?: string
          created_by: string
          id?: string
          tipo_arquivo?: string | null
        }
        Update: {
          arquivo_nome?: string
          arquivo_tamanho?: number | null
          arquivo_url?: string
          atendimento_id?: string
          created_at?: string
          created_by?: string
          id?: string
          tipo_arquivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atendimento_anexos_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_atendimento"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimentos: {
        Row: {
          arquivado: boolean | null
          assunto: string
          contato_id: string | null
          corretora_id: string | null
          created_at: string
          data_concluido: string | null
          data_retorno: string | null
          fluxo_concluido_id: string | null
          fluxo_concluido_nome: string | null
          fluxo_id: string | null
          id: string
          numero: number
          observacoes: string | null
          prioridade: Database["public"]["Enums"]["priority_type"]
          responsavel_id: string | null
          status: string
          status_changed_at: string | null
          tags: string[] | null
          tipo_atendimento: string | null
          updated_at: string
          user_id: string
          veiculo_ano: string | null
          veiculo_fipe_codigo: string | null
          veiculo_fipe_data_consulta: string | null
          veiculo_marca: string | null
          veiculo_modelo: string | null
          veiculo_tipo: string | null
          veiculo_valor_fipe: number | null
        }
        Insert: {
          arquivado?: boolean | null
          assunto: string
          contato_id?: string | null
          corretora_id?: string | null
          created_at?: string
          data_concluido?: string | null
          data_retorno?: string | null
          fluxo_concluido_id?: string | null
          fluxo_concluido_nome?: string | null
          fluxo_id?: string | null
          id?: string
          numero?: number
          observacoes?: string | null
          prioridade?: Database["public"]["Enums"]["priority_type"]
          responsavel_id?: string | null
          status?: string
          status_changed_at?: string | null
          tags?: string[] | null
          tipo_atendimento?: string | null
          updated_at?: string
          user_id: string
          veiculo_ano?: string | null
          veiculo_fipe_codigo?: string | null
          veiculo_fipe_data_consulta?: string | null
          veiculo_marca?: string | null
          veiculo_modelo?: string | null
          veiculo_tipo?: string | null
          veiculo_valor_fipe?: number | null
        }
        Update: {
          arquivado?: boolean | null
          assunto?: string
          contato_id?: string | null
          corretora_id?: string | null
          created_at?: string
          data_concluido?: string | null
          data_retorno?: string | null
          fluxo_concluido_id?: string | null
          fluxo_concluido_nome?: string | null
          fluxo_id?: string | null
          id?: string
          numero?: number
          observacoes?: string | null
          prioridade?: Database["public"]["Enums"]["priority_type"]
          responsavel_id?: string | null
          status?: string
          status_changed_at?: string | null
          tags?: string[] | null
          tipo_atendimento?: string | null
          updated_at?: string
          user_id?: string
          veiculo_ano?: string | null
          veiculo_fipe_codigo?: string | null
          veiculo_fipe_data_consulta?: string | null
          veiculo_marca?: string | null
          veiculo_modelo?: string | null
          veiculo_tipo?: string | null
          veiculo_valor_fipe?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "atendimentos_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_corretora_id_fkey"
            columns: ["corretora_id"]
            isOneToOne: false
            referencedRelation: "corretoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_fluxo_concluido_id_fkey"
            columns: ["fluxo_concluido_id"]
            isOneToOne: false
            referencedRelation: "fluxos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_fluxo_id_fkey"
            columns: ["fluxo_id"]
            isOneToOne: false
            referencedRelation: "fluxos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimentos_historico: {
        Row: {
          acao: string
          atendimento_id: string
          campos_alterados: Json | null
          created_at: string
          id: string
          user_id: string
          user_nome: string
          valores_anteriores: Json | null
          valores_novos: Json | null
        }
        Insert: {
          acao: string
          atendimento_id: string
          campos_alterados?: Json | null
          created_at?: string
          id?: string
          user_id: string
          user_nome: string
          valores_anteriores?: Json | null
          valores_novos?: Json | null
        }
        Update: {
          acao?: string
          atendimento_id?: string
          campos_alterados?: Json | null
          created_at?: string
          id?: string
          user_id?: string
          user_nome?: string
          valores_anteriores?: Json | null
          valores_novos?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "atendimentos_historico_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      comunicados: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string
          id: string
          imagem_url: string | null
          link: string | null
          mensagem: string
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por: string
          id?: string
          imagem_url?: string | null
          link?: string | null
          mensagem: string
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string
          id?: string
          imagem_url?: string | null
          link?: string | null
          mensagem?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      contatos: {
        Row: {
          cargo: string | null
          corretora_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          facebook: string | null
          id: string
          instagram: string | null
          linkedin: string | null
          nome: string
          observacoes: string | null
          telefone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          cargo?: string | null
          corretora_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          facebook?: string | null
          id?: string
          instagram?: string | null
          linkedin?: string | null
          nome: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          cargo?: string | null
          corretora_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          facebook?: string | null
          id?: string
          instagram?: string | null
          linkedin?: string | null
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contatos_corretora_id_fkey"
            columns: ["corretora_id"]
            isOneToOne: false
            referencedRelation: "corretoras"
            referencedColumns: ["id"]
          },
        ]
      }
      corretora_usuarios: {
        Row: {
          acesso_exclusivo_pid: boolean | null
          ativo: boolean | null
          corretora_id: string
          created_at: string | null
          email: string
          id: string
          profile_id: string | null
          senha_hash: string
          totp_configurado: boolean | null
          totp_secret: string | null
          updated_at: string | null
        }
        Insert: {
          acesso_exclusivo_pid?: boolean | null
          ativo?: boolean | null
          corretora_id: string
          created_at?: string | null
          email: string
          id?: string
          profile_id?: string | null
          senha_hash: string
          totp_configurado?: boolean | null
          totp_secret?: string | null
          updated_at?: string | null
        }
        Update: {
          acesso_exclusivo_pid?: boolean | null
          ativo?: boolean | null
          corretora_id?: string
          created_at?: string | null
          email?: string
          id?: string
          profile_id?: string | null
          senha_hash?: string
          totp_configurado?: boolean | null
          totp_secret?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "corretora_usuarios_corretora_id_fkey"
            columns: ["corretora_id"]
            isOneToOne: false
            referencedRelation: "corretoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corretora_usuarios_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      corretoras: {
        Row: {
          cep: string | null
          cidade: string | null
          cnpj: string | null
          created_at: string
          created_by: string | null
          email: string | null
          endereco: string | null
          estado: string | null
          id: string
          logo_url: string | null
          nome: string
          observacoes: string | null
          responsavel: string | null
          slug: string | null
          susep: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          logo_url?: string | null
          nome: string
          observacoes?: string | null
          responsavel?: string | null
          slug?: string | null
          susep?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          logo_url?: string | null
          nome?: string
          observacoes?: string | null
          responsavel?: string | null
          slug?: string | null
          susep?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      documentos: {
        Row: {
          arquivo_nome: string
          arquivo_tamanho: number | null
          arquivo_url: string
          created_at: string
          criado_por: string
          descricao: string | null
          id: string
          tipo_arquivo: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          arquivo_nome: string
          arquivo_tamanho?: number | null
          arquivo_url: string
          created_at?: string
          criado_por: string
          descricao?: string | null
          id?: string
          tipo_arquivo?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          arquivo_nome?: string
          arquivo_tamanho?: number | null
          arquivo_url?: string
          created_at?: string
          criado_por?: string
          descricao?: string | null
          id?: string
          tipo_arquivo?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_auto_config: {
        Row: {
          created_at: string | null
          enabled: boolean | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_config: {
        Row: {
          created_at: string | null
          from_email: string
          from_name: string
          id: string
          smtp_host: string
          smtp_password: string
          smtp_port: number
          smtp_user: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          from_email: string
          from_name: string
          id?: string
          smtp_host: string
          smtp_password: string
          smtp_port?: number
          smtp_user: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          from_email?: string
          from_name?: string
          id?: string
          smtp_host?: string
          smtp_password?: string
          smtp_port?: number
          smtp_user?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_historico: {
        Row: {
          assunto: string
          atendimento_id: string
          corpo: string
          created_at: string | null
          destinatario: string
          enviado_em: string | null
          enviado_por: string
          erro_mensagem: string | null
          id: string
          status: string
        }
        Insert: {
          assunto: string
          atendimento_id: string
          corpo: string
          created_at?: string | null
          destinatario: string
          enviado_em?: string | null
          enviado_por: string
          erro_mensagem?: string | null
          id?: string
          status?: string
        }
        Update: {
          assunto?: string
          atendimento_id?: string
          corpo?: string
          created_at?: string | null
          destinatario?: string
          enviado_em?: string | null
          enviado_por?: string
          erro_mensagem?: string | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_historico_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          agendado_para: string | null
          assunto: string
          atendimento_id: string | null
          corpo: string
          created_at: string | null
          destinatario: string
          enviado_em: string | null
          erro_mensagem: string | null
          id: string
          max_tentativas: number | null
          prioridade: number | null
          status: string
          tentativas: number | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          agendado_para?: string | null
          assunto: string
          atendimento_id?: string | null
          corpo: string
          created_at?: string | null
          destinatario: string
          enviado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          max_tentativas?: number | null
          prioridade?: number | null
          status?: string
          tentativas?: number | null
          tipo: string
          updated_at?: string | null
        }
        Update: {
          agendado_para?: string | null
          assunto?: string
          atendimento_id?: string | null
          corpo?: string
          created_at?: string | null
          destinatario?: string
          enviado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          max_tentativas?: number | null
          prioridade?: number | null
          status?: string
          tentativas?: number | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      email_rate_limits: {
        Row: {
          created_at: string | null
          emails_sent: number | null
          id: string
          limite_diario: number | null
          periodo_inicio: string | null
          provider: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          emails_sent?: number | null
          id?: string
          limite_diario?: number | null
          periodo_inicio?: string | null
          provider: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          emails_sent?: number | null
          id?: string
          limite_diario?: number | null
          periodo_inicio?: string | null
          provider?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          assunto: string
          ativo: boolean | null
          corpo: string
          created_at: string | null
          id: string
          nome: string
          status: string[] | null
          tipo: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assunto: string
          ativo?: boolean | null
          corpo: string
          created_at?: string | null
          id?: string
          nome: string
          status?: string[] | null
          tipo?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assunto?: string
          ativo?: boolean | null
          corpo?: string
          created_at?: string | null
          id?: string
          nome?: string
          status?: string[] | null
          tipo?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      equipe_lideres: {
        Row: {
          created_at: string | null
          equipe_id: string
          id: string
          lider_id: string
        }
        Insert: {
          created_at?: string | null
          equipe_id: string
          id?: string
          lider_id: string
        }
        Update: {
          created_at?: string | null
          equipe_id?: string
          id?: string
          lider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_lideres_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_lideres_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipes: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          lider_id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          lider_id: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          lider_id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipes_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos: {
        Row: {
          cor: string | null
          created_at: string | null
          data_fim: string
          data_inicio: string
          descricao: string | null
          google_event_id: string | null
          id: string
          lembrete_minutos: number[] | null
          local: string | null
          tipo: string | null
          titulo: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cor?: string | null
          created_at?: string | null
          data_fim: string
          data_inicio: string
          descricao?: string | null
          google_event_id?: string | null
          id?: string
          lembrete_minutos?: number[] | null
          local?: string | null
          tipo?: string | null
          titulo: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cor?: string | null
          created_at?: string | null
          data_fim?: string
          data_inicio?: string
          descricao?: string | null
          google_event_id?: string | null
          id?: string
          lembrete_minutos?: number[] | null
          local?: string | null
          tipo?: string | null
          titulo?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      fluxos: {
        Row: {
          ativo: boolean
          cor: string | null
          created_at: string
          descricao: string | null
          gera_proximo_automatico: boolean
          id: string
          nome: string
          ordem: number
          proximo_fluxo_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cor?: string | null
          created_at?: string
          descricao?: string | null
          gera_proximo_automatico?: boolean
          id?: string
          nome: string
          ordem?: number
          proximo_fluxo_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cor?: string | null
          created_at?: string
          descricao?: string | null
          gera_proximo_automatico?: boolean
          id?: string
          nome?: string
          ordem?: number
          proximo_fluxo_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxos_proximo_fluxo_id_fkey"
            columns: ["proximo_fluxo_id"]
            isOneToOne: false
            referencedRelation: "fluxos"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_integrations: {
        Row: {
          access_token: string
          connected_at: string
          created_at: string
          id: string
          last_sync_at: string | null
          refresh_token: string
          token_expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          refresh_token: string
          token_expires_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          refresh_token?: string
          token_expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lancamentos_financeiros: {
        Row: {
          apolice_numero: string | null
          aprovado_em: string | null
          aprovado_por: string | null
          banco_agencia: string | null
          banco_codigo: string | null
          banco_conta: string | null
          banco_favorecido: string | null
          categoria: string
          conciliado: boolean | null
          conciliado_por: string | null
          corretora_id: string | null
          created_at: string | null
          created_by: string
          data_competencia: string
          data_conciliacao: string | null
          data_lancamento: string
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string
          documento_fiscal: string | null
          documento_url: string | null
          forma_pagamento: string | null
          id: string
          moeda: string
          motivo_rejeicao: string | null
          numero_lancamento: string
          observacoes: string | null
          rejeitado_em: string | null
          rejeitado_por: string | null
          sinistro_id: string | null
          status: string
          subcategoria: string | null
          tipo_lancamento: string
          updated_at: string | null
          updated_by: string | null
          valor_bruto: number
          valor_desconto: number | null
          valor_liquido: number
        }
        Insert: {
          apolice_numero?: string | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          banco_agencia?: string | null
          banco_codigo?: string | null
          banco_conta?: string | null
          banco_favorecido?: string | null
          categoria: string
          conciliado?: boolean | null
          conciliado_por?: string | null
          corretora_id?: string | null
          created_at?: string | null
          created_by: string
          data_competencia: string
          data_conciliacao?: string | null
          data_lancamento?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao: string
          documento_fiscal?: string | null
          documento_url?: string | null
          forma_pagamento?: string | null
          id?: string
          moeda?: string
          motivo_rejeicao?: string | null
          numero_lancamento: string
          observacoes?: string | null
          rejeitado_em?: string | null
          rejeitado_por?: string | null
          sinistro_id?: string | null
          status?: string
          subcategoria?: string | null
          tipo_lancamento: string
          updated_at?: string | null
          updated_by?: string | null
          valor_bruto: number
          valor_desconto?: number | null
          valor_liquido: number
        }
        Update: {
          apolice_numero?: string | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          banco_agencia?: string | null
          banco_codigo?: string | null
          banco_conta?: string | null
          banco_favorecido?: string | null
          categoria?: string
          conciliado?: boolean | null
          conciliado_por?: string | null
          corretora_id?: string | null
          created_at?: string | null
          created_by?: string
          data_competencia?: string
          data_conciliacao?: string | null
          data_lancamento?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string
          documento_fiscal?: string | null
          documento_url?: string | null
          forma_pagamento?: string | null
          id?: string
          moeda?: string
          motivo_rejeicao?: string | null
          numero_lancamento?: string
          observacoes?: string | null
          rejeitado_em?: string | null
          rejeitado_por?: string | null
          sinistro_id?: string | null
          status?: string
          subcategoria?: string | null
          tipo_lancamento?: string
          updated_at?: string | null
          updated_by?: string | null
          valor_bruto?: number
          valor_desconto?: number | null
          valor_liquido?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_financeiros_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_financeiros_conciliado_por_fkey"
            columns: ["conciliado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_financeiros_corretora_id_fkey"
            columns: ["corretora_id"]
            isOneToOne: false
            referencedRelation: "corretoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_financeiros_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_financeiros_rejeitado_por_fkey"
            columns: ["rejeitado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_financeiros_sinistro_id_fkey"
            columns: ["sinistro_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_financeiros_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lembretes_disparados: {
        Row: {
          created_at: string | null
          disparado_em: string | null
          evento_id: string
          id: string
          user_id: string
          visualizado: boolean | null
        }
        Insert: {
          created_at?: string | null
          disparado_em?: string | null
          evento_id: string
          id?: string
          user_id: string
          visualizado?: boolean | null
        }
        Update: {
          created_at?: string | null
          disparado_em?: string | null
          evento_id?: string
          id?: string
          user_id?: string
          visualizado?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "lembretes_disparados_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      links_uteis: {
        Row: {
          categoria: string | null
          created_at: string
          criado_por: string
          descricao: string | null
          id: string
          titulo: string
          updated_at: string
          url: string
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          criado_por: string
          descricao?: string | null
          id?: string
          titulo: string
          updated_at?: string
          url: string
        }
        Update: {
          categoria?: string | null
          created_at?: string
          criado_por?: string
          descricao?: string | null
          id?: string
          titulo?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      mensagens: {
        Row: {
          anexos: Json | null
          assunto: string
          created_at: string
          destinatario_id: string
          em_resposta_a: string | null
          id: string
          lida: boolean
          mensagem: string
          remetente_id: string
          updated_at: string
        }
        Insert: {
          anexos?: Json | null
          assunto: string
          created_at?: string
          destinatario_id: string
          em_resposta_a?: string | null
          id?: string
          lida?: boolean
          mensagem: string
          remetente_id: string
          updated_at?: string
        }
        Update: {
          anexos?: Json | null
          assunto?: string
          created_at?: string
          destinatario_id?: string
          em_resposta_a?: string | null
          id?: string
          lida?: boolean
          mensagem?: string
          remetente_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_em_resposta_a_fkey"
            columns: ["em_resposta_a"]
            isOneToOne: false
            referencedRelation: "mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_alertas: {
        Row: {
          created_at: string
          enviado_para: Json
          id: string
          meta_esperada: number
          periodo_analise: string
          responsavel_id: string
          tipo_alerta: string
          valor_atual: number
        }
        Insert: {
          created_at?: string
          enviado_para?: Json
          id?: string
          meta_esperada: number
          periodo_analise: string
          responsavel_id: string
          tipo_alerta: string
          valor_atual: number
        }
        Update: {
          created_at?: string
          enviado_para?: Json
          id?: string
          meta_esperada?: number
          periodo_analise?: string
          responsavel_id?: string
          tipo_alerta?: string
          valor_atual?: number
        }
        Relationships: []
      }
      performance_metas: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          meta_minima_atendimentos: number
          meta_taxa_conclusao: number
          meta_tempo_medio_horas: number
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          meta_minima_atendimentos?: number
          meta_taxa_conclusao?: number
          meta_tempo_medio_horas?: number
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          meta_minima_atendimentos?: number
          meta_taxa_conclusao?: number
          meta_tempo_medio_horas?: number
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      permission_change_logs: {
        Row: {
          acao: string
          authorized_by: string
          created_at: string | null
          detalhes: Json | null
          id: string
          senha_validada: boolean | null
          target_user_id: string
          tipo_permissao: string
          user_id: string
        }
        Insert: {
          acao: string
          authorized_by: string
          created_at?: string | null
          detalhes?: Json | null
          id?: string
          senha_validada?: boolean | null
          target_user_id: string
          tipo_permissao: string
          user_id: string
        }
        Update: {
          acao?: string
          authorized_by?: string
          created_at?: string | null
          detalhes?: Json | null
          id?: string
          senha_validada?: boolean | null
          target_user_id?: string
          tipo_permissao?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_change_logs_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_change_logs_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_change_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pid_audit_log: {
        Row: {
          acao: string
          corretora_id: string
          created_at: string | null
          detalhes: Json | null
          id: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          corretora_id: string
          created_at?: string | null
          detalhes?: Json | null
          id?: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          corretora_id?: string
          created_at?: string | null
          detalhes?: Json | null
          id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pid_audit_log_corretora_id_fkey"
            columns: ["corretora_id"]
            isOneToOne: false
            referencedRelation: "corretoras"
            referencedColumns: ["id"]
          },
        ]
      }
      pid_estudo_base: {
        Row: {
          corretora_id: string
          created_at: string
          created_by: string | null
          data_referencia: string
          id: string
          protegido_caminhoes: number | null
          protegido_carretas: number | null
          protegido_especiais_importados: number | null
          protegido_geral: number | null
          protegido_motocicletas: number | null
          protegido_passeio: number | null
          protegido_taxi_app: number | null
          protegido_utilitarios_suvs_vans: number | null
          qtd_caminhoes: number | null
          qtd_carretas: number | null
          qtd_especiais_importados: number | null
          qtd_motocicletas: number | null
          qtd_passeio: number | null
          qtd_taxi_app: number | null
          qtd_utilitarios_suvs_vans: number | null
          tm_caminhoes: number | null
          tm_carretas: number | null
          tm_especiais_importados: number | null
          tm_geral: number | null
          tm_motocicletas: number | null
          tm_passeio: number | null
          tm_taxi_app: number | null
          tm_utilitarios_suvs_vans: number | null
          total_veiculos_ativos: number | null
          total_veiculos_geral: number | null
          updated_at: string
          updated_by: string | null
          valor_protegido_caminhoes: number | null
          valor_protegido_carretas: number | null
          valor_protegido_especiais_importados: number | null
          valor_protegido_geral: number | null
          valor_protegido_motocicletas: number | null
          valor_protegido_passeio: number | null
          valor_protegido_taxi_app: number | null
          valor_protegido_utilitarios_suvs_vans: number | null
        }
        Insert: {
          corretora_id: string
          created_at?: string
          created_by?: string | null
          data_referencia: string
          id?: string
          protegido_caminhoes?: number | null
          protegido_carretas?: number | null
          protegido_especiais_importados?: number | null
          protegido_geral?: number | null
          protegido_motocicletas?: number | null
          protegido_passeio?: number | null
          protegido_taxi_app?: number | null
          protegido_utilitarios_suvs_vans?: number | null
          qtd_caminhoes?: number | null
          qtd_carretas?: number | null
          qtd_especiais_importados?: number | null
          qtd_motocicletas?: number | null
          qtd_passeio?: number | null
          qtd_taxi_app?: number | null
          qtd_utilitarios_suvs_vans?: number | null
          tm_caminhoes?: number | null
          tm_carretas?: number | null
          tm_especiais_importados?: number | null
          tm_geral?: number | null
          tm_motocicletas?: number | null
          tm_passeio?: number | null
          tm_taxi_app?: number | null
          tm_utilitarios_suvs_vans?: number | null
          total_veiculos_ativos?: number | null
          total_veiculos_geral?: number | null
          updated_at?: string
          updated_by?: string | null
          valor_protegido_caminhoes?: number | null
          valor_protegido_carretas?: number | null
          valor_protegido_especiais_importados?: number | null
          valor_protegido_geral?: number | null
          valor_protegido_motocicletas?: number | null
          valor_protegido_passeio?: number | null
          valor_protegido_taxi_app?: number | null
          valor_protegido_utilitarios_suvs_vans?: number | null
        }
        Update: {
          corretora_id?: string
          created_at?: string
          created_by?: string | null
          data_referencia?: string
          id?: string
          protegido_caminhoes?: number | null
          protegido_carretas?: number | null
          protegido_especiais_importados?: number | null
          protegido_geral?: number | null
          protegido_motocicletas?: number | null
          protegido_passeio?: number | null
          protegido_taxi_app?: number | null
          protegido_utilitarios_suvs_vans?: number | null
          qtd_caminhoes?: number | null
          qtd_carretas?: number | null
          qtd_especiais_importados?: number | null
          qtd_motocicletas?: number | null
          qtd_passeio?: number | null
          qtd_taxi_app?: number | null
          qtd_utilitarios_suvs_vans?: number | null
          tm_caminhoes?: number | null
          tm_carretas?: number | null
          tm_especiais_importados?: number | null
          tm_geral?: number | null
          tm_motocicletas?: number | null
          tm_passeio?: number | null
          tm_taxi_app?: number | null
          tm_utilitarios_suvs_vans?: number | null
          total_veiculos_ativos?: number | null
          total_veiculos_geral?: number | null
          updated_at?: string
          updated_by?: string | null
          valor_protegido_caminhoes?: number | null
          valor_protegido_carretas?: number | null
          valor_protegido_especiais_importados?: number | null
          valor_protegido_geral?: number | null
          valor_protegido_motocicletas?: number | null
          valor_protegido_passeio?: number | null
          valor_protegido_taxi_app?: number | null
          valor_protegido_utilitarios_suvs_vans?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pid_estudo_base_corretora_id_fkey"
            columns: ["corretora_id"]
            isOneToOne: false
            referencedRelation: "corretoras"
            referencedColumns: ["id"]
          },
        ]
      }
      pid_operacional: {
        Row: {
          abertura_carro_reserva: number | null
          abertura_indenizacao_integral_associado: number | null
          abertura_indenizacao_integral_terceiro: number | null
          abertura_indenizacao_parcial_associado: number | null
          abertura_indenizacao_parcial_terceiro: number | null
          abertura_total_eventos: number | null
          abertura_vidros: number | null
          acionamentos_assistencia: number | null
          ano: number
          arrecadamento_juros: number | null
          baixado_pendencia: number | null
          boletos_abertos: number | null
          boletos_cancelados: number | null
          boletos_emitidos: number | null
          boletos_liquidados: number | null
          cadastros_realizados: number | null
          cancelamentos: number | null
          churn: number | null
          cme_explit: number | null
          comprometimento_assistencia: number | null
          comprometimento_rastreamento: number | null
          corretora_id: string
          created_at: string
          created_by: string | null
          crescimento_liquido: number | null
          custo_assistencia: number | null
          custo_rastreamento: number | null
          custo_total_eventos: number | null
          custo_total_rateavel: number | null
          descontado_banco: number | null
          faturamento_operacional: number | null
          id: string
          inadimplentes: number | null
          indice_crescimento_bruto: number | null
          indice_dano_integral: number | null
          indice_dano_parcial: number | null
          instalacoes_rastreamento: number | null
          mes: number
          pagamento_qtd_carro_reserva: number | null
          pagamento_qtd_integral_associado: number | null
          pagamento_qtd_integral_terceiro: number | null
          pagamento_qtd_parcial_associado: number | null
          pagamento_qtd_parcial_terceiro: number | null
          pagamento_qtd_vidros: number | null
          pagamento_valor_carro_reserva: number | null
          pagamento_valor_integral_associado: number | null
          pagamento_valor_integral_terceiro: number | null
          pagamento_valor_parcial_associado: number | null
          pagamento_valor_parcial_terceiro: number | null
          pagamento_valor_vidros: number | null
          percentual_adesoes: number | null
          percentual_arrecadacao_juros: number | null
          percentual_cancelamento_boletos: number | null
          percentual_cancelamentos: number | null
          percentual_crescimento_faturamento: number | null
          percentual_crescimento_recebido: number | null
          percentual_descontado_banco: number | null
          percentual_emissao_boleto: number | null
          percentual_inadimplencia: number | null
          percentual_inadimplencia_boletos: number | null
          percentual_inadimplencia_financeira: number | null
          percentual_rateio: number | null
          placas_ativas: number | null
          rateio_periodo: number | null
          reativacao: number | null
          recebimento_operacional: number | null
          saldo_placas: number | null
          sinistralidade_financeira: number | null
          sinistralidade_geral: number | null
          ticket_medio_boleto: number | null
          ticket_medio_carro_reserva: number | null
          ticket_medio_integral: number | null
          ticket_medio_parcial: number | null
          ticket_medio_vidros: number | null
          total_associados: number | null
          total_cotas: number | null
          total_recebido: number | null
          updated_at: string
          updated_by: string | null
          valor_boletos_abertos: number | null
          valor_boletos_cancelados: number | null
          veiculos_rastreados: number | null
        }
        Insert: {
          abertura_carro_reserva?: number | null
          abertura_indenizacao_integral_associado?: number | null
          abertura_indenizacao_integral_terceiro?: number | null
          abertura_indenizacao_parcial_associado?: number | null
          abertura_indenizacao_parcial_terceiro?: number | null
          abertura_total_eventos?: number | null
          abertura_vidros?: number | null
          acionamentos_assistencia?: number | null
          ano: number
          arrecadamento_juros?: number | null
          baixado_pendencia?: number | null
          boletos_abertos?: number | null
          boletos_cancelados?: number | null
          boletos_emitidos?: number | null
          boletos_liquidados?: number | null
          cadastros_realizados?: number | null
          cancelamentos?: number | null
          churn?: number | null
          cme_explit?: number | null
          comprometimento_assistencia?: number | null
          comprometimento_rastreamento?: number | null
          corretora_id: string
          created_at?: string
          created_by?: string | null
          crescimento_liquido?: number | null
          custo_assistencia?: number | null
          custo_rastreamento?: number | null
          custo_total_eventos?: number | null
          custo_total_rateavel?: number | null
          descontado_banco?: number | null
          faturamento_operacional?: number | null
          id?: string
          inadimplentes?: number | null
          indice_crescimento_bruto?: number | null
          indice_dano_integral?: number | null
          indice_dano_parcial?: number | null
          instalacoes_rastreamento?: number | null
          mes: number
          pagamento_qtd_carro_reserva?: number | null
          pagamento_qtd_integral_associado?: number | null
          pagamento_qtd_integral_terceiro?: number | null
          pagamento_qtd_parcial_associado?: number | null
          pagamento_qtd_parcial_terceiro?: number | null
          pagamento_qtd_vidros?: number | null
          pagamento_valor_carro_reserva?: number | null
          pagamento_valor_integral_associado?: number | null
          pagamento_valor_integral_terceiro?: number | null
          pagamento_valor_parcial_associado?: number | null
          pagamento_valor_parcial_terceiro?: number | null
          pagamento_valor_vidros?: number | null
          percentual_adesoes?: number | null
          percentual_arrecadacao_juros?: number | null
          percentual_cancelamento_boletos?: number | null
          percentual_cancelamentos?: number | null
          percentual_crescimento_faturamento?: number | null
          percentual_crescimento_recebido?: number | null
          percentual_descontado_banco?: number | null
          percentual_emissao_boleto?: number | null
          percentual_inadimplencia?: number | null
          percentual_inadimplencia_boletos?: number | null
          percentual_inadimplencia_financeira?: number | null
          percentual_rateio?: number | null
          placas_ativas?: number | null
          rateio_periodo?: number | null
          reativacao?: number | null
          recebimento_operacional?: number | null
          saldo_placas?: number | null
          sinistralidade_financeira?: number | null
          sinistralidade_geral?: number | null
          ticket_medio_boleto?: number | null
          ticket_medio_carro_reserva?: number | null
          ticket_medio_integral?: number | null
          ticket_medio_parcial?: number | null
          ticket_medio_vidros?: number | null
          total_associados?: number | null
          total_cotas?: number | null
          total_recebido?: number | null
          updated_at?: string
          updated_by?: string | null
          valor_boletos_abertos?: number | null
          valor_boletos_cancelados?: number | null
          veiculos_rastreados?: number | null
        }
        Update: {
          abertura_carro_reserva?: number | null
          abertura_indenizacao_integral_associado?: number | null
          abertura_indenizacao_integral_terceiro?: number | null
          abertura_indenizacao_parcial_associado?: number | null
          abertura_indenizacao_parcial_terceiro?: number | null
          abertura_total_eventos?: number | null
          abertura_vidros?: number | null
          acionamentos_assistencia?: number | null
          ano?: number
          arrecadamento_juros?: number | null
          baixado_pendencia?: number | null
          boletos_abertos?: number | null
          boletos_cancelados?: number | null
          boletos_emitidos?: number | null
          boletos_liquidados?: number | null
          cadastros_realizados?: number | null
          cancelamentos?: number | null
          churn?: number | null
          cme_explit?: number | null
          comprometimento_assistencia?: number | null
          comprometimento_rastreamento?: number | null
          corretora_id?: string
          created_at?: string
          created_by?: string | null
          crescimento_liquido?: number | null
          custo_assistencia?: number | null
          custo_rastreamento?: number | null
          custo_total_eventos?: number | null
          custo_total_rateavel?: number | null
          descontado_banco?: number | null
          faturamento_operacional?: number | null
          id?: string
          inadimplentes?: number | null
          indice_crescimento_bruto?: number | null
          indice_dano_integral?: number | null
          indice_dano_parcial?: number | null
          instalacoes_rastreamento?: number | null
          mes?: number
          pagamento_qtd_carro_reserva?: number | null
          pagamento_qtd_integral_associado?: number | null
          pagamento_qtd_integral_terceiro?: number | null
          pagamento_qtd_parcial_associado?: number | null
          pagamento_qtd_parcial_terceiro?: number | null
          pagamento_qtd_vidros?: number | null
          pagamento_valor_carro_reserva?: number | null
          pagamento_valor_integral_associado?: number | null
          pagamento_valor_integral_terceiro?: number | null
          pagamento_valor_parcial_associado?: number | null
          pagamento_valor_parcial_terceiro?: number | null
          pagamento_valor_vidros?: number | null
          percentual_adesoes?: number | null
          percentual_arrecadacao_juros?: number | null
          percentual_cancelamento_boletos?: number | null
          percentual_cancelamentos?: number | null
          percentual_crescimento_faturamento?: number | null
          percentual_crescimento_recebido?: number | null
          percentual_descontado_banco?: number | null
          percentual_emissao_boleto?: number | null
          percentual_inadimplencia?: number | null
          percentual_inadimplencia_boletos?: number | null
          percentual_inadimplencia_financeira?: number | null
          percentual_rateio?: number | null
          placas_ativas?: number | null
          rateio_periodo?: number | null
          reativacao?: number | null
          recebimento_operacional?: number | null
          saldo_placas?: number | null
          sinistralidade_financeira?: number | null
          sinistralidade_geral?: number | null
          ticket_medio_boleto?: number | null
          ticket_medio_carro_reserva?: number | null
          ticket_medio_integral?: number | null
          ticket_medio_parcial?: number | null
          ticket_medio_vidros?: number | null
          total_associados?: number | null
          total_cotas?: number | null
          total_recebido?: number | null
          updated_at?: string
          updated_by?: string | null
          valor_boletos_abertos?: number | null
          valor_boletos_cancelados?: number | null
          veiculos_rastreados?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pid_operacional_corretora_id_fkey"
            columns: ["corretora_id"]
            isOneToOne: false
            referencedRelation: "corretoras"
            referencedColumns: ["id"]
          },
        ]
      }
      producao_financeira: {
        Row: {
          competencia: string
          corretora_id: string
          created_at: string | null
          criado_por_usuario_id: string | null
          id: string
          observacoes: string | null
          percentual_comissao: number | null
          premio_total: number | null
          produto: string | null
          repasse_pago: number | null
          repasse_previsto: number | null
          segurado_nome: string | null
          seguradora: string | null
          status: string | null
          tipo_origem: string
          updated_at: string | null
          valor_comissao: number | null
        }
        Insert: {
          competencia: string
          corretora_id: string
          created_at?: string | null
          criado_por_usuario_id?: string | null
          id?: string
          observacoes?: string | null
          percentual_comissao?: number | null
          premio_total?: number | null
          produto?: string | null
          repasse_pago?: number | null
          repasse_previsto?: number | null
          segurado_nome?: string | null
          seguradora?: string | null
          status?: string | null
          tipo_origem?: string
          updated_at?: string | null
          valor_comissao?: number | null
        }
        Update: {
          competencia?: string
          corretora_id?: string
          created_at?: string | null
          criado_por_usuario_id?: string | null
          id?: string
          observacoes?: string | null
          percentual_comissao?: number | null
          premio_total?: number | null
          produto?: string | null
          repasse_pago?: number | null
          repasse_previsto?: number | null
          segurado_nome?: string | null
          seguradora?: string | null
          status?: string | null
          tipo_origem?: string
          updated_at?: string | null
          valor_comissao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "producao_financeira_corretora_id_fkey"
            columns: ["corretora_id"]
            isOneToOne: false
            referencedRelation: "corretoras"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          administrativo_id: string | null
          ativo: boolean
          avatar_url: string | null
          cargo: string | null
          cpf_cnpj: string | null
          created_at: string
          email: string
          equipe_id: string | null
          facebook: string | null
          force_password_change: boolean | null
          id: string
          instagram: string | null
          lider_id: string | null
          linkedin: string | null
          nome: string
          status: string | null
          telefone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          administrativo_id?: string | null
          ativo?: boolean
          avatar_url?: string | null
          cargo?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email: string
          equipe_id?: string | null
          facebook?: string | null
          force_password_change?: boolean | null
          id: string
          instagram?: string | null
          lider_id?: string | null
          linkedin?: string | null
          nome: string
          status?: string | null
          telefone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          administrativo_id?: string | null
          ativo?: boolean
          avatar_url?: string | null
          cargo?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string
          equipe_id?: string | null
          facebook?: string | null
          force_password_change?: boolean | null
          id?: string
          instagram?: string | null
          lider_id?: string | null
          linkedin?: string | null
          nome?: string
          status?: string | null
          telefone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_administrativo_id_fkey"
            columns: ["administrativo_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resend_config: {
        Row: {
          created_at: string
          from_email: string
          from_name: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_email: string
          from_name: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_email?: string
          from_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      role_menu_permissions: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          menu_item: string
          pode_editar: boolean | null
          pode_visualizar: boolean | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          menu_item: string
          pode_editar?: boolean | null
          pode_visualizar?: boolean | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          menu_item?: string
          pode_editar?: boolean | null
          pode_visualizar?: boolean | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_menu_permissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sinistro_acompanhamento: {
        Row: {
          atendimento_id: string
          cilia_budget_id: string | null
          cilia_enviado: boolean | null
          cilia_enviado_em: string | null
          cilia_response: Json | null
          comite_data: string | null
          comite_decisao: string | null
          comite_observacoes: string | null
          comite_participantes: string[] | null
          comite_status: string | null
          cota_participacao: number | null
          cota_percentual: number | null
          created_at: string
          created_by: string | null
          custo_mao_obra: number | null
          custo_outros: number | null
          custo_pecas: number | null
          custo_servicos: number | null
          desistencia: boolean | null
          desistencia_data: string | null
          desistencia_motivo: string | null
          entrevista_data: string | null
          entrevista_preenchida_por: string | null
          entrevista_respostas: Json | null
          finalizado: boolean | null
          finalizado_data: string | null
          finalizado_observacoes: string | null
          finalizado_por: string | null
          financeiro_comprovante_url: string | null
          financeiro_data_pagamento: string | null
          financeiro_forma_pagamento: string | null
          financeiro_status: string | null
          financeiro_valor_aprovado: number | null
          financeiro_valor_pago: number | null
          id: string
          oficina_cnpj: string | null
          oficina_contato: string | null
          oficina_endereco: string | null
          oficina_nome: string | null
          oficina_tipo: string | null
          parecer_analista: string | null
          parecer_analista_data: string | null
          parecer_analista_justificativa: string | null
          parecer_associacao: string | null
          parecer_associacao_data: string | null
          parecer_associacao_justificativa: string | null
          pecas_aprovadas: boolean | null
          pecas_descricao: string | null
          pecas_valor_total: number | null
          reparo_autorizado: boolean | null
          reparo_autorizado_por: string | null
          reparo_data_autorizacao: string | null
          reparo_observacoes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          atendimento_id: string
          cilia_budget_id?: string | null
          cilia_enviado?: boolean | null
          cilia_enviado_em?: string | null
          cilia_response?: Json | null
          comite_data?: string | null
          comite_decisao?: string | null
          comite_observacoes?: string | null
          comite_participantes?: string[] | null
          comite_status?: string | null
          cota_participacao?: number | null
          cota_percentual?: number | null
          created_at?: string
          created_by?: string | null
          custo_mao_obra?: number | null
          custo_outros?: number | null
          custo_pecas?: number | null
          custo_servicos?: number | null
          desistencia?: boolean | null
          desistencia_data?: string | null
          desistencia_motivo?: string | null
          entrevista_data?: string | null
          entrevista_preenchida_por?: string | null
          entrevista_respostas?: Json | null
          finalizado?: boolean | null
          finalizado_data?: string | null
          finalizado_observacoes?: string | null
          finalizado_por?: string | null
          financeiro_comprovante_url?: string | null
          financeiro_data_pagamento?: string | null
          financeiro_forma_pagamento?: string | null
          financeiro_status?: string | null
          financeiro_valor_aprovado?: number | null
          financeiro_valor_pago?: number | null
          id?: string
          oficina_cnpj?: string | null
          oficina_contato?: string | null
          oficina_endereco?: string | null
          oficina_nome?: string | null
          oficina_tipo?: string | null
          parecer_analista?: string | null
          parecer_analista_data?: string | null
          parecer_analista_justificativa?: string | null
          parecer_associacao?: string | null
          parecer_associacao_data?: string | null
          parecer_associacao_justificativa?: string | null
          pecas_aprovadas?: boolean | null
          pecas_descricao?: string | null
          pecas_valor_total?: number | null
          reparo_autorizado?: boolean | null
          reparo_autorizado_por?: string | null
          reparo_data_autorizacao?: string | null
          reparo_observacoes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          atendimento_id?: string
          cilia_budget_id?: string | null
          cilia_enviado?: boolean | null
          cilia_enviado_em?: string | null
          cilia_response?: Json | null
          comite_data?: string | null
          comite_decisao?: string | null
          comite_observacoes?: string | null
          comite_participantes?: string[] | null
          comite_status?: string | null
          cota_participacao?: number | null
          cota_percentual?: number | null
          created_at?: string
          created_by?: string | null
          custo_mao_obra?: number | null
          custo_outros?: number | null
          custo_pecas?: number | null
          custo_servicos?: number | null
          desistencia?: boolean | null
          desistencia_data?: string | null
          desistencia_motivo?: string | null
          entrevista_data?: string | null
          entrevista_preenchida_por?: string | null
          entrevista_respostas?: Json | null
          finalizado?: boolean | null
          finalizado_data?: string | null
          finalizado_observacoes?: string | null
          finalizado_por?: string | null
          financeiro_comprovante_url?: string | null
          financeiro_data_pagamento?: string | null
          financeiro_forma_pagamento?: string | null
          financeiro_status?: string | null
          financeiro_valor_aprovado?: number | null
          financeiro_valor_pago?: number | null
          id?: string
          oficina_cnpj?: string | null
          oficina_contato?: string | null
          oficina_endereco?: string | null
          oficina_nome?: string | null
          oficina_tipo?: string | null
          parecer_analista?: string | null
          parecer_analista_data?: string | null
          parecer_analista_justificativa?: string | null
          parecer_associacao?: string | null
          parecer_associacao_data?: string | null
          parecer_associacao_justificativa?: string | null
          pecas_aprovadas?: boolean | null
          pecas_descricao?: string | null
          pecas_valor_total?: number | null
          reparo_autorizado?: boolean | null
          reparo_autorizado_por?: string | null
          reparo_data_autorizacao?: string | null
          reparo_observacoes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sinistro_acompanhamento_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: true
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sinistro_acompanhamento_entrevista_preenchida_por_fkey"
            columns: ["entrevista_preenchida_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sinistro_pergunta_categorias: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
          tipo_sinistro: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          tipo_sinistro: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          tipo_sinistro?: string
          updated_at?: string
        }
        Relationships: []
      }
      sinistro_perguntas: {
        Row: {
          ativo: boolean
          auto_preenchivel: string | null
          categoria_id: string | null
          created_at: string
          id: string
          nivel_alerta: string | null
          obrigatoria: boolean
          opcoes: Json | null
          ordem: number
          pergunta: string
          peso: number
          peso_negativo: string[] | null
          peso_positivo: string[] | null
          tipo_campo: string
          tipo_sinistro: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          auto_preenchivel?: string | null
          categoria_id?: string | null
          created_at?: string
          id?: string
          nivel_alerta?: string | null
          obrigatoria?: boolean
          opcoes?: Json | null
          ordem?: number
          pergunta: string
          peso?: number
          peso_negativo?: string[] | null
          peso_positivo?: string[] | null
          tipo_campo?: string
          tipo_sinistro: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          auto_preenchivel?: string | null
          categoria_id?: string | null
          created_at?: string
          id?: string
          nivel_alerta?: string | null
          obrigatoria?: boolean
          opcoes?: Json | null
          ordem?: number
          pergunta?: string
          peso?: number
          peso_negativo?: string[] | null
          peso_positivo?: string[] | null
          tipo_campo?: string
          tipo_sinistro?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sinistro_perguntas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "sinistro_pergunta_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      status_config: {
        Row: {
          ativo: boolean
          cor: string
          created_at: string
          fluxo_id: string | null
          id: string
          is_final: boolean | null
          nome: string
          ordem: number
          prazo_horas: number
          tipo_etapa: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cor?: string
          created_at?: string
          fluxo_id?: string | null
          id?: string
          is_final?: boolean | null
          nome: string
          ordem?: number
          prazo_horas?: number
          tipo_etapa?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cor?: string
          created_at?: string
          fluxo_id?: string | null
          id?: string
          is_final?: boolean | null
          nome?: string
          ordem?: number
          prazo_horas?: number
          tipo_etapa?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_config_fluxo_id_fkey"
            columns: ["fluxo_id"]
            isOneToOne: false
            referencedRelation: "fluxos"
            referencedColumns: ["id"]
          },
        ]
      }
      status_publicos_config: {
        Row: {
          created_at: string | null
          descricao_publica: string | null
          fluxo_id: string
          id: string
          ordem_exibicao: number | null
          status_nome: string
          updated_at: string | null
          visivel_publico: boolean | null
        }
        Insert: {
          created_at?: string | null
          descricao_publica?: string | null
          fluxo_id: string
          id?: string
          ordem_exibicao?: number | null
          status_nome: string
          updated_at?: string | null
          visivel_publico?: boolean | null
        }
        Update: {
          created_at?: string | null
          descricao_publica?: string | null
          fluxo_id?: string
          id?: string
          ordem_exibicao?: number | null
          status_nome?: string
          updated_at?: string | null
          visivel_publico?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "status_publicos_config_fluxo_id_fkey"
            columns: ["fluxo_id"]
            isOneToOne: false
            referencedRelation: "fluxos"
            referencedColumns: ["id"]
          },
        ]
      }
      subdominios_personalizados: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          subdominio: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          subdominio: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          subdominio?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      termos: {
        Row: {
          arquivo_nome: string
          arquivo_url: string
          ativo: boolean | null
          corretora_id: string | null
          created_at: string | null
          created_by: string
          descricao: string | null
          id: string
          obrigatorio: boolean | null
          ordem: number | null
          tipo_sinistro: string[] | null
          titulo: string
          updated_at: string | null
        }
        Insert: {
          arquivo_nome: string
          arquivo_url: string
          ativo?: boolean | null
          corretora_id?: string | null
          created_at?: string | null
          created_by: string
          descricao?: string | null
          id?: string
          obrigatorio?: boolean | null
          ordem?: number | null
          tipo_sinistro?: string[] | null
          titulo: string
          updated_at?: string | null
        }
        Update: {
          arquivo_nome?: string
          arquivo_url?: string
          ativo?: boolean | null
          corretora_id?: string | null
          created_at?: string | null
          created_by?: string
          descricao?: string | null
          id?: string
          obrigatorio?: boolean | null
          ordem?: number | null
          tipo_sinistro?: string[] | null
          titulo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "termos_corretora_id_fkey"
            columns: ["corretora_id"]
            isOneToOne: false
            referencedRelation: "corretoras"
            referencedColumns: ["id"]
          },
        ]
      }
      termos_aceitos: {
        Row: {
          aceito_em: string | null
          id: string
          ip_address: string | null
          termo_hash: string | null
          termo_id: string
          termo_version: number | null
          user_agent: string | null
          vistoria_id: string
        }
        Insert: {
          aceito_em?: string | null
          id?: string
          ip_address?: string | null
          termo_hash?: string | null
          termo_id: string
          termo_version?: number | null
          user_agent?: string | null
          vistoria_id: string
        }
        Update: {
          aceito_em?: string | null
          id?: string
          ip_address?: string | null
          termo_hash?: string | null
          termo_id?: string
          termo_version?: number | null
          user_agent?: string | null
          vistoria_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "termos_aceitos_termo_id_fkey"
            columns: ["termo_id"]
            isOneToOne: false
            referencedRelation: "termos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termos_aceitos_vistoria_id_fkey"
            columns: ["vistoria_id"]
            isOneToOne: false
            referencedRelation: "vistorias"
            referencedColumns: ["id"]
          },
        ]
      }
      user_fluxo_permissions: {
        Row: {
          created_at: string
          created_by: string | null
          fluxo_id: string
          id: string
          pode_editar: boolean
          pode_visualizar: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fluxo_id: string
          id?: string
          pode_editar?: boolean
          pode_visualizar?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fluxo_id?: string
          id?: string
          pode_editar?: boolean
          pode_visualizar?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_fluxo_permissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_fluxo_permissions_fluxo_id_fkey"
            columns: ["fluxo_id"]
            isOneToOne: false
            referencedRelation: "fluxos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_fluxo_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_logs: {
        Row: {
          action: string
          changes: Json | null
          created_at: string | null
          id: string
          target_user_id: string
          user_id: string
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string | null
          id?: string
          target_user_id: string
          user_id: string
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string | null
          id?: string
          target_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_menu_permissions: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          menu_item: string
          pode_editar: boolean | null
          pode_visualizar: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          menu_item: string
          pode_editar?: boolean | null
          pode_visualizar?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          menu_item?: string
          pode_editar?: boolean | null
          pode_visualizar?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_menu_permissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_menu_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_totp: {
        Row: {
          created_at: string | null
          enabled: boolean | null
          id: string
          secret: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          secret: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          secret?: string
          user_id?: string
        }
        Relationships: []
      }
      vistoria_config_corretora: {
        Row: {
          corretora_id: string
          created_at: string
          id: string
          prazo_expiracao_link_horas: number
          prazo_realizacao_dias: number
          updated_at: string
        }
        Insert: {
          corretora_id: string
          created_at?: string
          id?: string
          prazo_expiracao_link_horas?: number
          prazo_realizacao_dias?: number
          updated_at?: string
        }
        Update: {
          corretora_id?: string
          created_at?: string
          id?: string
          prazo_expiracao_link_horas?: number
          prazo_realizacao_dias?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vistoria_config_corretora_corretora_id_fkey"
            columns: ["corretora_id"]
            isOneToOne: true
            referencedRelation: "corretoras"
            referencedColumns: ["id"]
          },
        ]
      }
      vistoria_fotos: {
        Row: {
          analise_ia: Json | null
          analise_manual: boolean | null
          aprovada_em: string | null
          aprovada_por: string | null
          arquivo_nome: string
          arquivo_tamanho: number | null
          arquivo_url: string
          created_at: string
          id: string
          observacao_reprovacao: string | null
          ordem: number
          posicao: string
          status_analise: string | null
          status_aprovacao: string | null
          vistoria_id: string
        }
        Insert: {
          analise_ia?: Json | null
          analise_manual?: boolean | null
          aprovada_em?: string | null
          aprovada_por?: string | null
          arquivo_nome: string
          arquivo_tamanho?: number | null
          arquivo_url: string
          created_at?: string
          id?: string
          observacao_reprovacao?: string | null
          ordem: number
          posicao: string
          status_analise?: string | null
          status_aprovacao?: string | null
          vistoria_id: string
        }
        Update: {
          analise_ia?: Json | null
          analise_manual?: boolean | null
          aprovada_em?: string | null
          aprovada_por?: string | null
          arquivo_nome?: string
          arquivo_tamanho?: number | null
          arquivo_url?: string
          created_at?: string
          id?: string
          observacao_reprovacao?: string | null
          ordem?: number
          posicao?: string
          status_analise?: string | null
          status_aprovacao?: string | null
          vistoria_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vistoria_fotos_vistoria_id_fkey"
            columns: ["vistoria_id"]
            isOneToOne: false
            referencedRelation: "vistorias"
            referencedColumns: ["id"]
          },
        ]
      }
      vistoria_prazo_config: {
        Row: {
          ativo: boolean
          corretora_id: string
          created_at: string
          id: string
          prazo_dias: number
          prazo_horas: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          corretora_id: string
          created_at?: string
          id?: string
          prazo_dias?: number
          prazo_horas?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          corretora_id?: string
          created_at?: string
          id?: string
          prazo_dias?: number
          prazo_horas?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vistoria_prazo_config_corretora_id_fkey"
            columns: ["corretora_id"]
            isOneToOne: true
            referencedRelation: "corretoras"
            referencedColumns: ["id"]
          },
        ]
      }
      vistorias: {
        Row: {
          acionou_assistencia_24h: boolean | null
          analise_ia: Json | null
          assinatura_url: string | null
          atendimento_id: string | null
          atestado_obito_url: string | null
          bo_url: string | null
          cliente_cpf: string | null
          cliente_email: string | null
          cliente_nome: string | null
          cliente_telefone: string | null
          cnh_dados: Json | null
          cnh_url: string | null
          cof: string | null
          completed_at: string | null
          condutor_veiculo: string | null
          corretora_id: string | null
          created_at: string
          created_by: string
          crlv_fotos_urls: string[] | null
          croqui_acidente_url: string | null
          custo_acordo: number | null
          custo_oficina: number | null
          custo_perda_parcial: number | null
          custo_perda_total: number | null
          custo_reparo: number | null
          custo_terceiros: number | null
          danos_detectados: string[] | null
          data_evento: string | null
          data_incidente: string | null
          dias_validade: number | null
          endereco: string | null
          estava_chovendo: boolean | null
          fez_bo: boolean | null
          foi_hospital: boolean | null
          hora_evento: string | null
          horario_fim: string | null
          horario_inicio: string | null
          houve_remocao_veiculo: boolean | null
          id: string
          latitude: number | null
          laudo_alcoolemia_url: string | null
          laudo_medico_url: string | null
          link_expires_at: string | null
          link_token: string | null
          local_tem_camera: boolean | null
          longitude: number | null
          motorista_faleceu: boolean | null
          narrar_fatos: string | null
          numero: number
          observacoes_ia: string | null
          placa_terceiro: string | null
          policia_foi_local: boolean | null
          prazo_manual: boolean | null
          prazo_validade: string | null
          quilometragem: number | null
          relato_incidente: string | null
          relatorio_url: string | null
          status: string
          tem_terceiros: boolean | null
          tipo_abertura: string
          tipo_pintura: string | null
          tipo_sinistro: string | null
          tipo_vistoria: string
          updated_at: string
          valor_franquia: number | null
          valor_indenizacao: number | null
          veiculo_ano: string | null
          veiculo_chassi: string | null
          veiculo_cor: string | null
          veiculo_fipe_codigo: string | null
          veiculo_fipe_data_consulta: string | null
          veiculo_marca: string | null
          veiculo_modelo: string | null
          veiculo_placa: string | null
          veiculo_tipo: string | null
          veiculo_uf: string | null
          veiculo_valor_fipe: number | null
          vitima_ou_causador: string | null
        }
        Insert: {
          acionou_assistencia_24h?: boolean | null
          analise_ia?: Json | null
          assinatura_url?: string | null
          atendimento_id?: string | null
          atestado_obito_url?: string | null
          bo_url?: string | null
          cliente_cpf?: string | null
          cliente_email?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          cnh_dados?: Json | null
          cnh_url?: string | null
          cof?: string | null
          completed_at?: string | null
          condutor_veiculo?: string | null
          corretora_id?: string | null
          created_at?: string
          created_by: string
          crlv_fotos_urls?: string[] | null
          croqui_acidente_url?: string | null
          custo_acordo?: number | null
          custo_oficina?: number | null
          custo_perda_parcial?: number | null
          custo_perda_total?: number | null
          custo_reparo?: number | null
          custo_terceiros?: number | null
          danos_detectados?: string[] | null
          data_evento?: string | null
          data_incidente?: string | null
          dias_validade?: number | null
          endereco?: string | null
          estava_chovendo?: boolean | null
          fez_bo?: boolean | null
          foi_hospital?: boolean | null
          hora_evento?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          houve_remocao_veiculo?: boolean | null
          id?: string
          latitude?: number | null
          laudo_alcoolemia_url?: string | null
          laudo_medico_url?: string | null
          link_expires_at?: string | null
          link_token?: string | null
          local_tem_camera?: boolean | null
          longitude?: number | null
          motorista_faleceu?: boolean | null
          narrar_fatos?: string | null
          numero?: number
          observacoes_ia?: string | null
          placa_terceiro?: string | null
          policia_foi_local?: boolean | null
          prazo_manual?: boolean | null
          prazo_validade?: string | null
          quilometragem?: number | null
          relato_incidente?: string | null
          relatorio_url?: string | null
          status?: string
          tem_terceiros?: boolean | null
          tipo_abertura: string
          tipo_pintura?: string | null
          tipo_sinistro?: string | null
          tipo_vistoria: string
          updated_at?: string
          valor_franquia?: number | null
          valor_indenizacao?: number | null
          veiculo_ano?: string | null
          veiculo_chassi?: string | null
          veiculo_cor?: string | null
          veiculo_fipe_codigo?: string | null
          veiculo_fipe_data_consulta?: string | null
          veiculo_marca?: string | null
          veiculo_modelo?: string | null
          veiculo_placa?: string | null
          veiculo_tipo?: string | null
          veiculo_uf?: string | null
          veiculo_valor_fipe?: number | null
          vitima_ou_causador?: string | null
        }
        Update: {
          acionou_assistencia_24h?: boolean | null
          analise_ia?: Json | null
          assinatura_url?: string | null
          atendimento_id?: string | null
          atestado_obito_url?: string | null
          bo_url?: string | null
          cliente_cpf?: string | null
          cliente_email?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          cnh_dados?: Json | null
          cnh_url?: string | null
          cof?: string | null
          completed_at?: string | null
          condutor_veiculo?: string | null
          corretora_id?: string | null
          created_at?: string
          created_by?: string
          crlv_fotos_urls?: string[] | null
          croqui_acidente_url?: string | null
          custo_acordo?: number | null
          custo_oficina?: number | null
          custo_perda_parcial?: number | null
          custo_perda_total?: number | null
          custo_reparo?: number | null
          custo_terceiros?: number | null
          danos_detectados?: string[] | null
          data_evento?: string | null
          data_incidente?: string | null
          dias_validade?: number | null
          endereco?: string | null
          estava_chovendo?: boolean | null
          fez_bo?: boolean | null
          foi_hospital?: boolean | null
          hora_evento?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          houve_remocao_veiculo?: boolean | null
          id?: string
          latitude?: number | null
          laudo_alcoolemia_url?: string | null
          laudo_medico_url?: string | null
          link_expires_at?: string | null
          link_token?: string | null
          local_tem_camera?: boolean | null
          longitude?: number | null
          motorista_faleceu?: boolean | null
          narrar_fatos?: string | null
          numero?: number
          observacoes_ia?: string | null
          placa_terceiro?: string | null
          policia_foi_local?: boolean | null
          prazo_manual?: boolean | null
          prazo_validade?: string | null
          quilometragem?: number | null
          relato_incidente?: string | null
          relatorio_url?: string | null
          status?: string
          tem_terceiros?: boolean | null
          tipo_abertura?: string
          tipo_pintura?: string | null
          tipo_sinistro?: string | null
          tipo_vistoria?: string
          updated_at?: string
          valor_franquia?: number | null
          valor_indenizacao?: number | null
          veiculo_ano?: string | null
          veiculo_chassi?: string | null
          veiculo_cor?: string | null
          veiculo_fipe_codigo?: string | null
          veiculo_fipe_data_consulta?: string | null
          veiculo_marca?: string | null
          veiculo_modelo?: string | null
          veiculo_placa?: string | null
          veiculo_tipo?: string | null
          veiculo_uf?: string | null
          veiculo_valor_fipe?: number | null
          vitima_ou_causador?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vistorias_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vistorias_corretora_id_fkey"
            columns: ["corretora_id"]
            isOneToOne: false
            referencedRelation: "corretoras"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      administrativo_can_view_profile: {
        Args: { target_profile_id: string; viewer_id: string }
        Returns: boolean
      }
      can_send_email: { Args: { provider_name: string }; Returns: boolean }
      can_view_profile: {
        Args: { target_profile_id: string; viewer_id: string }
        Returns: boolean
      }
      generate_lancamento_numero: { Args: never; Returns: string }
      get_user_corretora_id: { Args: { _user_id: string }; Returns: string }
      get_user_lider_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reset_email_rate_limits: { Args: never; Returns: undefined }
      user_can_access_fluxo: {
        Args: { _fluxo_id: string; _require_edit?: boolean; _user_id: string }
        Returns: boolean
      }
      user_can_access_menu: {
        Args: { _menu_item: string; _require_edit?: boolean; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "lider"
        | "comercial"
        | "superintendente"
        | "administrativo"
        | "parceiro"
      priority_type: "Alta" | "Média" | "Baixa"
      status_type: "novo" | "andamento" | "aguardo" | "concluido"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "lider",
        "comercial",
        "superintendente",
        "administrativo",
        "parceiro",
      ],
      priority_type: ["Alta", "Média", "Baixa"],
      status_type: ["novo", "andamento", "aguardo", "concluido"],
    },
  },
} as const
