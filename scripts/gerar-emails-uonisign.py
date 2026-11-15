import json
HEAD = '''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{titulo_pagina} - {{{{empresa}}}}</title>
</head>
<body style="margin:0;padding:0;background:#f3f5fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5fb;">
<tr><td align="center" style="padding:32px 12px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e6ebf5;border-radius:20px;overflow:hidden;">

  <!-- CABEÇALHO -->
  <tr><td style="background:#0b1220;padding:22px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:19px;font-weight:800;color:#ffffff;">{cabecalho}</td>
      <td align="right" style="font-size:12px;color:#cbd5f5;">Uon1 Sign</td>
    </tr></table>
  </td></tr>

  <!-- CONTEÚDO -->
  <tr><td style="padding:28px;">

    <span style="display:inline-block;background:{selo_fundo};color:{selo_cor};padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;">{selo}</span>

    <p style="margin:18px 0 8px;font-size:18px;font-weight:700;color:#0f172a;">{titulo}</p>

    <p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:#475569;">
      Olá, <strong>{{{{nome}}}}</strong>.<br><br>
      {intro}
    </p>
'''
DADOS = '''
    <!-- DADOS DO CONTRATO -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6ebf5;border-radius:16px;">
      <tr><td style="padding:18px 20px 6px;font-size:15px;font-weight:800;color:#0f172a;">📄 Dados do contrato</td></tr>
      <tr><td style="padding:8px 20px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="62%" valign="top" style="background:#f8fafc;border-radius:12px;padding:12px 14px;">
            <div style="font-size:12px;color:#64748b;margin-bottom:4px;">Contrato</div>
            <div style="font-size:15px;font-weight:700;color:#0f172a;">{{contrato}}</div>
          </td>
          <td width="4%"></td>
          <td width="34%" valign="top" style="background:#f8fafc;border-radius:12px;padding:12px 14px;">
            <div style="font-size:12px;color:#64748b;margin-bottom:4px;">Número</div>
            <div style="font-size:15px;font-weight:700;color:#2563eb;">{{numero}}</div>
          </td>
        </tr></table>
      </td></tr>
    </table>
'''
def caixa(fundo, borda, cor_t, cor_v, rotulo, valor, nota):
    return f'''
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;background:{fundo};border:1px solid {borda};border-radius:16px;">
      <tr><td style="padding:18px 20px;">
        <div style="font-size:13px;font-weight:700;color:{cor_t};">{rotulo}</div>
        <div style="margin-top:6px;font-size:24px;font-weight:800;color:{cor_v};">{valor}</div>
        <div style="margin-top:6px;font-size:13px;line-height:1.6;color:{cor_t};">{nota}</div>
      </td></tr>
    </table>
'''
def info(titulo, texto):
    return f'''
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;background:#f8fafc;border-radius:16px;">
      <tr><td style="padding:16px 20px;">
        <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:6px;">{titulo}</div>
        <div style="font-size:13px;line-height:1.7;color:#475569;">{texto}</div>
      </td></tr>
    </table>
'''
def botao(texto, url, cor="#2563eb"):
    return f'''
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
      <tr><td align="center" style="background:{cor};border-radius:14px;">
        <a href="{url}" style="display:block;padding:16px;font-size:16px;font-weight:800;color:#ffffff;text-decoration:none;">{texto}</a>
      </td></tr>
    </table>
    <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#94a3b8;word-break:break-all;">
      Se o botão não funcionar, copie e cole no navegador:<br>{url}
    </p>
'''
FOOT = '''
    <p style="margin:22px 0 0;font-size:14px;color:#0f172a;">Atenciosamente,<br><strong>{{empresa}}</strong></p>
  </td></tr>

  <!-- RODAPÉ -->
  <tr><td style="padding:20px;border-top:1px solid #eef2ff;text-align:center;">
    <table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>
      <td style="padding:0 12px;"><img src="https://uon1.com.br/assets/uon1-logo-CPDoIAps.png" alt="UON1" height="28" style="height:28px;display:block;border:0;"></td>
      <td style="padding:0 6px;"><div style="width:1px;height:26px;background:#dbe3f3;"></div></td>
      <td style="padding:0 12px;"><img src="https://vangard.uon1.com.br/images/logo-vangard.png" alt="Vangard Gestora" height="28" style="height:28px;display:block;border:0;"></td>
    </tr></table>
    <div style="margin-top:12px;font-size:11px;color:#94a3b8;">Mensagem automática do Uon1 Sign · plataforma desenvolvida por <strong>UON1</strong>. Não responda este e-mail.</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>'''

def h(**k): return HEAD.format(**k)

modelos = {
 "codigo": ("Código de assinatura: {{codigo}}", h(titulo_pagina="Código de assinatura", cabecalho="🔐 Código de assinatura", selo="CONFIRMAÇÃO DE ASSINATURA", selo_fundo="#ede9fe", selo_cor="#6d28d9", titulo="Seu código para assinar o contrato",
   intro="Use o código abaixo para confirmar a assinatura do contrato <strong>{{contrato}}</strong> (nº {{numero}}). Digite-o na página de assinatura, que continua aberta no seu navegador.")
   + '''
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:16px;">
      <tr><td align="center" style="padding:24px 20px;">
        <div style="font-size:13px;font-weight:700;color:#5b21b6;">Código de uso único</div>
        <div style="margin-top:10px;font-size:36px;letter-spacing:10px;font-weight:800;color:#4c1d95;">{{codigo}}</div>
        <div style="margin-top:10px;font-size:13px;color:#5b21b6;">Válido por {{validade}} minutos · pode ser usado uma vez</div>
      </td></tr>
    </table>
''' + info("⚠️ Não pediu este código?", "Ignore esta mensagem e não compartilhe o código com ninguém. A equipe da {{empresa}} nunca pede o código por telefone ou mensagem.") + FOOT),
 "lembrete": ("Lembrete: assine o contrato {{numero}}", h(titulo_pagina="Lembrete de assinatura", cabecalho="⏰ Lembrete de assinatura", selo="AGUARDANDO SUA ASSINATURA", selo_fundo="#fef3c7", selo_cor="#b45309", titulo="Seu contrato ainda aguarda assinatura",
   intro="O contrato abaixo foi enviado pela <strong>{{empresa}}</strong> há {{dias}} dia(s) e ainda aguarda a sua assinatura eletrônica. Leva poucos minutos: abra o link, leia o documento e confirme com o código de 6 dígitos que enviaremos a você.")
   + DADOS + caixa("#fff7ed","#fdba74","#9a3412","#c2410c","⏳ Prazo para assinatura","{{prazo}}","Depois dessa data o link expira e será preciso um novo envio.")
   + botao("✍️ Revisar e assinar","{{link}}") + FOOT),
 "concluido": ("Contrato assinado: {{contrato}}", h(titulo_pagina="Contrato assinado", cabecalho="✅ Contrato assinado", selo="ASSINADO POR TODAS AS PARTES", selo_fundo="#dcfce7", selo_cor="#15803d", titulo="Assinaturas concluídas",
   intro="O contrato abaixo foi assinado por todas as partes. A cópia final, com o relatório de assinaturas, segue anexa a este e-mail. Guarde-a com seus documentos.")
   + DADOS + caixa("#f0fdf4","#86efac","#166534","#15803d","🛡️ Código de verificação Uon1 Trust","{{codigo_verificacao}}","Com este código qualquer pessoa pode conferir a autenticidade do contrato e se o arquivo não foi alterado.")
   + botao("🔎 Conferir autenticidade","{{url_validacao}}","#15803d") + FOOT),
 "aviso": ("{{assunto}}: {{contrato}}", h(titulo_pagina="Atualização do contrato", cabecalho="📣 Atualização do contrato", selo="{{assunto}}", selo_fundo="#fee2e2", selo_cor="#b91c1c", titulo="Houve uma atualização no seu contrato",
   intro="{{mensagem}}")
   + DADOS + info("Precisa de ajuda?", "Em caso de dúvida, fale com a equipe da <strong>{{empresa}}</strong> que enviou o contrato. O link de assinatura anterior deixou de valer.") + FOOT),
}
import os
os.makedirs("/home/claude/uon1/docs/uonisign/emails", exist_ok=True)
sql=[]
for tipo,(assunto,html) in modelos.items():
    open(f"/home/claude/uon1/docs/uonisign/emails/{tipo}.html","w").write(html)
    assert "$t$" not in html
    sql.append(f"update email_templates set assunto = $a${assunto}$a$, updated_at = now(), corpo = $t${html}$t$ where tipo = 'uonisign_{tipo}';")
open("/tmp/uonisign-emails.sql","w").write("\n".join(sql))
print(len("\n".join(sql)))
