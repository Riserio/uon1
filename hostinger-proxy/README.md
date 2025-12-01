# 🔧 PROXY CILIA - Hostinger

Solução temporária para contornar o problema de whitelist de IP da CILIA usando seu servidor Hostinger.

## 📋 O PROBLEMA

A API CILIA usa whitelist de IP para autenticação. As Edge Functions do Supabase usam IPs dinâmicos da AWS (us-east-1) que não estão na whitelist, causando erro 401 (token inválido).

## ✅ A SOLUÇÃO

Criar um proxy intermediário no seu Hostinger (que tem IP fixo) que:
1. Recebe requisições do sistema
2. Repassa para a API CILIA
3. Retorna a resposta

```
Sistema → Edge Function → Proxy Hostinger (IP fixo) → API CILIA
```

## 🚀 INSTALAÇÃO

### 1. Upload do arquivo PHP

1. Acesse o painel do Hostinger (File Manager ou FTP)
2. Navegue até a pasta `public_html` (ou pasta do seu domínio)
3. Faça upload do arquivo `cilia-proxy.php`
4. Anote a URL completa: `https://seudominio.com/cilia-proxy.php`

### 2. Descobrir o IP fixo do Hostinger

Abra o terminal/console e execute:

```bash
nslookup seudominio.com
```

Ou acesse: https://whatismyipaddress.com/hostname-ip

Anote o IP fixo do seu servidor.

### 3. Solicitar whitelist na CILIA

**IMPORTANTE:** Entre em contato com o suporte da CILIA e solicite:

> "Olá, preciso adicionar o IP **[SEU_IP_HOSTINGER]** à whitelist do meu token de acesso à API CILIA."

**Aguarde aprovação do suporte antes de prosseguir.**

### 4. Configurar no Sistema

1. Acesse **Configurações → Integrações com APIs**
2. Edite a integração CILIA
3. Preencha o campo **"URL do Proxy (Hostinger)"** com:
   ```
   https://seudominio.com/cilia-proxy.php
   ```
4. Salve a integração
5. Clique em **"Testar (Proxy)"**

## ✅ TESTE

Após configurar, você deve ver:
- ✅ Botão "Testar (Proxy)" no cartão da integração
- ✅ Mensagem de sucesso: "Conexão estabelecida com sucesso!"
- ✅ Status 201 com Budget criado na CILIA

## 🔍 DEBUG

Se ainda houver erros:

### 1. Verificar logs do proxy

Acesse via FTP/File Manager e verifique os logs de erro do PHP (error_log).

### 2. Testar diretamente o proxy

```bash
curl -X POST https://seudominio.com/cilia-proxy.php \
  -H "Content-Type: application/json" \
  -d '{
    "cilia_url": "https://sistema.cilia.com.br/services/generico-ws/rest/v2/integracao/createBudget",
    "auth_token": "SEU_TOKEN_AQUI",
    "payload": {
      "Budget": {
        "body": "TESTE123",
        "licensePlate": "ABC-1234",
        "vehicleName": "TESTE"
      }
    }
  }'
```

### 3. Verificar permissões

Certifique-se que o arquivo PHP tem permissões 644:

```bash
chmod 644 cilia-proxy.php
```

## ⚠️ SEGURANÇA

- ✅ O proxy usa HTTPS
- ✅ Valida requisições POST
- ✅ Verifica campos obrigatórios
- ⚠️ Remova os logs de debug em produção (linha `error_log`)

## 📞 SUPORTE CILIA

Se o IP ainda não for aceito:
- Verifique se o suporte CILIA confirmou o whitelist
- Confirme que o IP está correto
- Teste chamada direta via curl do seu Hostinger para CILIA

## 🔄 ALTERNATIVAS FUTURAS

1. **Ideal:** Solicitar à CILIA para desabilitar whitelist de IP para seu token
2. **AWS:** Implementar proxy em serviço com IP fixo (EC2, Lambda com VPC)
3. **Local:** Usar servidor local/VPS com IP fixo dedicado

---

**Status:** ✅ Solução temporária funcional
**Data:** 2025-12-01
