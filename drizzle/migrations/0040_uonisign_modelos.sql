-- 2026-11-14 — uoniSign: modelos de contrato do fluxo 2 (gerado por scripts/gerar-seed-uonisign.mjs)
--
-- Insere os modelos só se o slug ainda não existir. Antes de usar, o
-- administrador completa em uoniSign → Modelos → Configurar: CNPJ, endereço e
-- representante da Contratada e o signatário fixo da Vangard (Q3). Enquanto
-- isso não for feito, o envio fica bloqueado com aviso na tela.
--
-- Depende de 0039_uonisign_v2.sql. Idempotente. Aplicar sem modificações.

INSERT INTO public.contrato_templates
  (slug, titulo, descricao, categoria, conteudo_html, tipo_template, ativo, fluxo_versao,
   campos, contratada, signatario_contratada, prazo_assinatura_dias, lembrete_dias, created_by)
SELECT $uonisign$ppr-manutencao$uonisign$, $uonisign$Contrato PPR + Manutenção$uonisign$, $uonisign$Programa Preparatório Regulatório (PPR) com mensalidade durante a execução e manutenção mensal depois. Contratada: Vangard.$uonisign$, $uonisign$Prestação de Serviços$uonisign$,
  $uonisign$<h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS — PROGRAMA PREPARATÓRIO REGULATÓRIO (PPR) E MANUTENÇÃO</h1>
<p class="centro">Contrato nº ${Numero_Contrato}</p>

<p><strong>CONTRATANTE:</strong> ${Contratante}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${CNPJ_do_Contratante}, com sede em ${Endereco_Completo}, neste ato representada por ${Representante_Legal}, portador(a) do documento de identidade nº ${Identidade} e inscrito(a) no CPF sob o nº ${CPF}.</p>
<p><strong>CONTRATADA:</strong> ${Contratada_Razao_Social}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${Contratada_CNPJ}, com sede em ${Contratada_Endereco}, neste ato representada por ${Contratada_Representante}.</p>
<p>As partes acima qualificadas celebram o presente Contrato de Prestação de Serviços, que se regerá pelas cláusulas e condições a seguir.</p>

<h2>CLÁUSULA 1 — DO OBJETO</h2>
<p><strong>1.1.</strong> O presente contrato tem por objeto a prestação, pela CONTRATADA, de serviços de consultoria e assessoria técnica para preparação da CONTRATANTE ao ambiente regulatório aplicável às entidades de proteção patrimonial mutualista, por meio do <strong>Programa Preparatório Regulatório (PPR)</strong>, e, após a sua conclusão, dos <strong>serviços de manutenção</strong> descritos na Cláusula 4.</p>
<p><strong>1.2.</strong> O PPR compreende, conforme o diagnóstico e o cronograma apresentados à CONTRATANTE, as frentes de: política de rateio e precificação; capital de estabilização; grupos de proteção e critérios de aceitação; ouvidoria; compliance e proteção de dados; jurídico e provisões; auditoria interna; controle financeiro e plano de contas; indicadores de gestão e sinistralidade; rede credenciada; e mapeamento de processos e procedimentos internos.</p>
<p><strong>1.3.</strong> O PPR será executado em ciclos (sprints) ao longo de ${Prazo_PPR_Meses} meses, contados da data de início prevista na Cláusula 2, podendo o cronograma ser ajustado de comum acordo, por e-mail, sem necessidade de aditivo.</p>

<h2>CLÁUSULA 2 — DA VIGÊNCIA</h2>
<p><strong>2.1.</strong> Este contrato vigorará pelo prazo de ${Prazo_Vigencia_Meses} meses, contados a partir de ${Data_Inicio}, renovando-se automaticamente por períodos iguais e sucessivos, salvo manifestação em contrário de qualquer das partes com antecedência mínima de 30 (trinta) dias do término do período em curso.</p>

<h2>CLÁUSULA 3 — DO PREÇO E DO PAGAMENTO DO PPR</h2>
<p><strong>3.1.</strong> Pela execução do PPR, a CONTRATANTE pagará à CONTRATADA o valor mensal de ${Valor_Mensal_PPR} (${Valor_Mensal_PPR_Extenso}), durante o período de execução previsto na cláusula 1.3.</p>
<p><strong>3.2.</strong> As mensalidades vencerão todo dia ${Dia_Vencimento} de cada mês, sendo a primeira no mês seguinte ao início da prestação dos serviços.</p>
<p><strong>3.3.</strong> O pagamento será feito por boleto bancário ou outro meio indicado pela CONTRATADA, acompanhado do respectivo documento fiscal.</p>
<p><strong>3.4.</strong> Os boletos e documentos fiscais serão enviados ao e-mail de cobrança ${Email_para_cobranca}, aos cuidados do(a) responsável financeiro(a) ${Responsavel_financeiro}, telefone ${Telefone_do_Responsavel}. A CONTRATANTE deverá comunicar por escrito qualquer alteração desses dados; até a comunicação, são válidos os envios feitos aos contatos aqui indicados.</p>
<p><strong>3.5.</strong> O atraso no pagamento sujeitará a CONTRATANTE a multa de 2% (dois por cento), juros de mora de 1% (um por cento) ao mês, calculados pro rata die, e correção monetária pelo IPCA/IBGE. Atraso superior a 30 (trinta) dias autoriza a CONTRATADA a suspender os serviços, mediante aviso prévio de 5 (cinco) dias, até a regularização.</p>
<p><strong>3.6.</strong> Os valores deste contrato serão reajustados a cada 12 (doze) meses, contados da data de início, pela variação acumulada do IPCA/IBGE ou, na sua extinção, pelo índice oficial que o substituir.</p>

<h2>CLÁUSULA 4 — DOS SERVIÇOS DE MANUTENÇÃO</h2>
<p><strong>4.1.</strong> Concluído o PPR, a CONTRATADA passará a prestar os serviços de manutenção, que compreendem o acompanhamento periódico dos indicadores, a revisão das políticas implantadas, a atualização frente a mudanças normativas e o suporte consultivo à CONTRATANTE.</p>
<p><strong>4.1.1.</strong> A manutenção será prestada de forma remota, com reuniões periódicas de acompanhamento e relatórios de status, e visitas presenciais quando previamente ajustadas entre as partes.</p>
<p><strong>4.1.2.</strong> Pelos serviços de manutenção, a CONTRATANTE pagará à CONTRATADA o valor mensal de ${Valor_Mensal_Manutencao} (${Valor_Mensal_Manutencao_Extenso}), com vencimento e condições de pagamento iguais aos previstos na Cláusula 3.</p>
<p><strong>4.2.</strong> Demandas que extrapolem o escopo da manutenção, como defesas em processos administrativos ou judiciais, auditorias externas, pareceres específicos e implantação de novos produtos, serão objeto de proposta comercial própria.</p>

<h2>CLÁUSULA 5 — DAS OBRIGAÇÕES DA CONTRATADA</h2>
<p><strong>5.1.</strong> São obrigações da CONTRATADA: executar os serviços com diligência, por profissionais qualificados; apresentar o cronograma e os entregáveis de cada frente do PPR; manter a CONTRATANTE informada sobre o andamento dos trabalhos; e guardar sigilo sobre as informações recebidas.</p>
<p><strong>5.2.</strong> A CONTRATADA poderá se valer de profissionais e parceiros por ela contratados, permanecendo responsável perante a CONTRATANTE pela execução dos serviços.</p>

<h2>CLÁUSULA 6 — DAS OBRIGAÇÕES DA CONTRATANTE</h2>
<p><strong>6.1.</strong> São obrigações da CONTRATANTE: fornecer, nos prazos combinados, as informações, documentos, bases de dados e acessos necessários; indicar um responsável interno pelo projeto; participar das reuniões e validar os entregáveis; implementar as deliberações que lhe cabem; e efetuar os pagamentos na forma ajustada.</p>
<p><strong>6.2.</strong> Atrasos decorrentes da falta ou da insuficiência de informações da CONTRATANTE prorrogarão os prazos do cronograma pelo mesmo período, sem prejuízo das mensalidades.</p>

<h2>CLÁUSULA 7 — DOS ENTREGÁVEIS E DO ACEITE</h2>
<p><strong>7.1.</strong> Ao final de cada ciclo, a CONTRATADA apresentará os entregáveis correspondentes. A CONTRATANTE terá 10 (dez) dias úteis para aprová-los ou apontar, de forma fundamentada, os ajustes necessários; o silêncio nesse prazo será considerado aceite.</p>

<h2>CLÁUSULA 8 — DA NATUREZA DOS SERVIÇOS</h2>
<p><strong>8.1.</strong> Os serviços constituem obrigação de meio. A CONTRATADA não garante a obtenção de autorização, registro, aprovação ou resultado perante órgãos reguladores, que dependem de atos de terceiros e do cumprimento, pela CONTRATANTE, das medidas recomendadas.</p>
<p><strong>8.2.</strong> As decisões de gestão, inclusive sobre rateio, aceitação, provisões e pagamento de eventos, são de responsabilidade exclusiva dos órgãos de administração da CONTRATANTE.</p>

<h2>CLÁUSULA 9 — DA INDEPENDÊNCIA DAS PARTES</h2>
<p><strong>9.1.</strong> Este contrato não gera vínculo empregatício, societário ou de representação entre as partes ou entre uma delas e os empregados e prepostos da outra, cabendo a cada parte arcar integralmente com os encargos trabalhistas, previdenciários e fiscais de seus colaboradores.</p>

<h2>CLÁUSULA 10 — DA CONFIDENCIALIDADE</h2>
<p><strong>10.1.</strong> As partes manterão sigilo sobre todas as informações técnicas, comerciais, financeiras e de associados a que tiverem acesso em razão deste contrato, utilizando-as exclusivamente para a sua execução. Essa obrigação subsiste por 5 (cinco) anos após o término do contrato.</p>

<h2>CLÁUSULA 11 — DA PROTEÇÃO DE DADOS PESSOAIS</h2>
<p><strong>11.1.</strong> As partes cumprirão a Lei nº 13.709/2018 (LGPD). Quanto aos dados pessoais de associados e colaboradores compartilhados pela CONTRATANTE, esta atua como controladora e a CONTRATADA como operadora, tratando-os somente conforme as instruções da CONTRATANTE e para as finalidades deste contrato.</p>
<p><strong>11.2.</strong> A CONTRATADA adotará medidas de segurança técnicas e administrativas aptas a proteger os dados, comunicará à CONTRATANTE, em até 48 (quarenta e oito) horas, qualquer incidente de segurança que os envolva e, ao término do contrato, os eliminará ou devolverá, ressalvadas as hipóteses legais de guarda.</p>

<h2>CLÁUSULA 12 — DA PROPRIEDADE INTELECTUAL</h2>
<p><strong>12.1.</strong> As metodologias, modelos, ferramentas, sistemas e materiais preexistentes ou desenvolvidos pela CONTRATADA permanecem de sua propriedade. A CONTRATANTE recebe licença não exclusiva e intransferível para utilizar os entregáveis em suas atividades internas durante e após a vigência, vedada a sua comercialização ou cessão a terceiros.</p>

<h2>CLÁUSULA 13 — DA RESPONSABILIDADE</h2>
<p><strong>13.1.</strong> A responsabilidade da CONTRATADA por danos diretos decorrentes deste contrato fica limitada ao valor total pago pela CONTRATANTE nos 12 (doze) meses anteriores ao fato, não respondendo por lucros cessantes ou danos indiretos, ressalvados os casos de dolo ou culpa grave.</p>

<h2>CLÁUSULA 14 — DA RESCISÃO</h2>
<p><strong>14.1.</strong> Qualquer das partes poderá rescindir este contrato, sem justa causa, mediante aviso prévio por escrito de 30 (trinta) dias, sendo devidos os valores dos serviços prestados até a data da extinção.</p>
<p><strong>14.2.</strong> A rescisão imotivada pela CONTRATANTE durante a execução do PPR obriga-a ao pagamento de multa equivalente a 20% (vinte por cento) das mensalidades do PPR que seriam devidas até o término do prazo da cláusula 1.3.</p>
<p><strong>14.3.</strong> O contrato poderá ser rescindido de imediato, por notificação, em caso de descumprimento não sanado em 15 (quinze) dias do recebimento de notificação, de recuperação judicial ou extrajudicial, falência, liquidação ou dissolução de qualquer das partes.</p>

<h2>CLÁUSULA 15 — DA CONDUTA ÉTICA E ANTICORRUPÇÃO</h2>
<p><strong>15.1.</strong> As partes declaram conhecer e se obrigam a cumprir a Lei nº 12.846/2013, abstendo-se de oferecer, prometer ou dar vantagem indevida a agente público ou privado, direta ou indiretamente, em relação a este contrato.</p>

<h2>CLÁUSULA 16 — DA CESSÃO</h2>
<p><strong>16.1.</strong> Nenhuma das partes poderá ceder ou transferir este contrato sem a prévia anuência por escrito da outra, exceto a CONTRATADA para sociedades de seu grupo econômico, mediante comunicação à CONTRATANTE.</p>

<h2>CLÁUSULA 17 — DAS DISPOSIÇÕES GERAIS</h2>
<p><strong>17.1.</strong> A tolerância de uma parte quanto ao descumprimento de obrigação pela outra não importará novação ou renúncia. A eventual nulidade de uma cláusula não afetará as demais.</p>
<p><strong>17.2.</strong> Este contrato substitui quaisquer entendimentos anteriores sobre o seu objeto e só poderá ser alterado por aditivo assinado pelas partes.</p>

<h2>CLÁUSULA 18 — DAS COMUNICAÇÕES</h2>
<p><strong>18.1.</strong> As comunicações e notificações relativas a este contrato serão feitas por escrito e enviadas, no caso da CONTRATANTE, ao e-mail ${Email} e, no caso da CONTRATADA, ao e-mail ${Contratada_Email}, considerando-se recebidas na data do envio, salvo comprovação de falha na entrega.</p>

<h2>CLÁUSULA 19 — DA ASSINATURA ELETRÔNICA</h2>
<p><strong>19.1.</strong> As partes concordam em assinar este contrato eletronicamente pela plataforma uoniSign, com identificação do signatário por código de uso único enviado ao e-mail ou celular informado, registro de data, hora, endereço IP e dispositivo e verificação da integridade do documento por código hash, admitindo esse meio como válido para comprovar a autoria e a integridade do documento, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001.</p>
<p><strong>19.2.</strong> As partes reconhecem este contrato como título executivo extrajudicial, nos termos do art. 784, inciso III e § 4º, do Código de Processo Civil.</p>

<h2>CLÁUSULA 20 — DO FORO</h2>
<p><strong>20.1.</strong> Fica eleito o foro da comarca de ${Foro} para dirimir as questões oriundas deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.</p>

<p>E, por estarem justas e contratadas, as partes assinam este instrumento eletronicamente, na data registrada no relatório de assinaturas anexo.</p>$uonisign$,
  'html', true, 2,
  $uonisign$[{"chave":"Contratante","rotulo":"Razão social","tipo":"texto","grupo":"Dados da Contratante","min":3,"max":150},{"chave":"CNPJ_do_Contratante","rotulo":"CNPJ","tipo":"cnpj","grupo":"Dados da Contratante"},{"chave":"CEP","rotulo":"CEP","tipo":"cep","grupo":"Dados da Contratante"},{"chave":"Logradouro","rotulo":"Rua ou avenida","tipo":"texto","grupo":"Dados da Contratante","max":150},{"chave":"Numero","rotulo":"Número","tipo":"texto","grupo":"Dados da Contratante","max":10,"ajuda":"Aceita S/N"},{"chave":"Complemento","rotulo":"Complemento","tipo":"texto","grupo":"Dados da Contratante","obrigatorio":false,"max":60},{"chave":"Bairro","rotulo":"Bairro","tipo":"texto","grupo":"Dados da Contratante","max":80},{"chave":"Cidade","rotulo":"Cidade","tipo":"texto","grupo":"Dados da Contratante","max":80},{"chave":"Estado","rotulo":"UF","tipo":"uf","grupo":"Dados da Contratante"},{"chave":"Representante_Legal","rotulo":"Representante legal","tipo":"texto","grupo":"Dados da Contratante","min":3,"max":120,"ajuda":"Também será o signatário da Contratante"},{"chave":"Identidade","rotulo":"RG do representante","tipo":"texto","grupo":"Dados da Contratante","max":20},{"chave":"CPF","rotulo":"CPF do representante","tipo":"cpf","grupo":"Dados da Contratante"},{"chave":"Valor_Mensal_PPR","rotulo":"Mensalidade do PPR (R$)","tipo":"moeda","grupo":"Valores","clausula":"3.1","soma_valor":true},{"chave":"Prazo_PPR_Meses","rotulo":"Duração do PPR (meses)","tipo":"inteiro","grupo":"Valores","clausula":"1.3","min":1,"max":36,"padrao":"6"},{"chave":"Valor_Mensal_Manutencao","rotulo":"Mensalidade da manutenção (R$)","tipo":"moeda","grupo":"Valores","clausula":"4.1.2"},{"chave":"Dia_Vencimento","rotulo":"Dia de vencimento","tipo":"inteiro","grupo":"Valores","min":1,"max":28,"padrao":"10"},{"chave":"Email","rotulo":"E-mail da Contratante","tipo":"email","grupo":"E-mails e responsável financeiro","clausula":"18.1","ajuda":"Recebe as notificações e o convite de assinatura"},{"chave":"Email_para_cobranca","rotulo":"E-mail de cobrança","tipo":"email","grupo":"E-mails e responsável financeiro","clausula":"3.4","copiar_de":"Email"},{"chave":"Responsavel_financeiro","rotulo":"Responsável financeiro","tipo":"texto","grupo":"E-mails e responsável financeiro","max":120,"clausula":"3.4"},{"chave":"Telefone_do_Responsavel","rotulo":"Telefone do responsável financeiro","tipo":"telefone","grupo":"E-mails e responsável financeiro","clausula":"3.4"},{"chave":"Data_Inicio","rotulo":"Data de início","tipo":"data","grupo":"Vigência"},{"chave":"Prazo_Vigencia_Meses","rotulo":"Vigência (meses)","tipo":"inteiro","grupo":"Vigência","min":1,"max":120,"padrao":"12"}]$uonisign$::jsonb,
  $uonisign${"razao_social":"Vangard Gestora","cnpj":"","endereco":"","email":"contatos@vangardgestora.com.br","representante":"","foro":"Belo Horizonte/MG"}$uonisign$::jsonb,
  $uonisign${"nome":"","cpf":"","email":"","telefone":"","canais":["email"]}$uonisign$::jsonb,
  15, ARRAY[3, 7, 12],
  coalesce(
    (SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'superintendente' LIMIT 1),
    (SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin' LIMIT 1),
    (SELECT id FROM public.profiles LIMIT 1))
WHERE NOT EXISTS (SELECT 1 FROM public.contrato_templates WHERE slug = $uonisign$ppr-manutencao$uonisign$);

INSERT INTO public.contrato_templates
  (slug, titulo, descricao, categoria, conteudo_html, tipo_template, ativo, fluxo_versao,
   campos, contratada, signatario_contratada, prazo_assinatura_dias, lembrete_dias, created_by)
SELECT $uonisign$assistencia-24h-rastreamento$uonisign$, $uonisign$Adesão — Assistência 24h e Rastreamento$uonisign$, $uonisign$Adesão da associação aos serviços de assistência 24 horas e rastreamento veicular, com preço por veículo e franquia mínima.$uonisign$, $uonisign$Adesão$uonisign$,
  $uonisign$<h1>CONTRATO DE ADESÃO A SERVIÇOS DE ASSISTÊNCIA 24 HORAS E RASTREAMENTO VEICULAR</h1>
<p class="centro">Contrato nº ${Numero_Contrato}</p>

<p><strong>CONTRATANTE:</strong> ${Contratante}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${CNPJ_do_Contratante}, com sede em ${Endereco_Completo}, neste ato representada por ${Representante_Legal}, portador(a) do documento de identidade nº ${Identidade} e inscrito(a) no CPF sob o nº ${CPF}.</p>
<p><strong>CONTRATADA:</strong> ${Contratada_Razao_Social}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${Contratada_CNPJ}, com sede em ${Contratada_Endereco}, neste ato representada por ${Contratada_Representante}.</p>
<p>As partes acima qualificadas celebram o presente Contrato de Adesão, que se regerá pelas cláusulas e condições a seguir.</p>

<h2>CLÁUSULA 1 — DO OBJETO</h2>
<p><strong>1.1.</strong> O presente contrato tem por objeto a disponibilização, pela CONTRATADA, diretamente ou por meio de rede de prestadores por ela gerida, de serviços de <strong>assistência 24 horas</strong> e de <strong>rastreamento veicular</strong> aos veículos cadastrados pela CONTRATANTE, vinculados aos seus associados.</p>
<p><strong>1.2.</strong> A assistência 24 horas compreende, nos limites, franquias de quilometragem e quantidades de acionamento definidos na tabela de coberturas vigente, que integra este contrato: reboque ou guincho, socorro mecânico e elétrico, troca de pneu, chaveiro, pane seca, transporte ou hospedagem dos ocupantes e retorno do veículo reparado, quando aplicáveis.</p>
<p><strong>1.3.</strong> O rastreamento veicular compreende a instalação do equipamento por técnico credenciado, a central de monitoramento 24 horas, o acesso da CONTRATANTE à plataforma de localização e o apoio às ações de recuperação em caso de furto ou roubo, sem garantia de recuperação do veículo.</p>

<h2>CLÁUSULA 2 — DA VIGÊNCIA</h2>
<p><strong>2.1.</strong> Este contrato vigorará pelo prazo de ${Prazo_Vigencia_Meses} meses, contados a partir de ${Data_Inicio}, renovando-se automaticamente por períodos iguais e sucessivos, salvo manifestação em contrário de qualquer das partes com antecedência mínima de 30 (trinta) dias do término do período em curso.</p>

<h2>CLÁUSULA 3 — DO CADASTRO DOS VEÍCULOS</h2>
<p><strong>3.1.</strong> A CONTRATANTE informará à CONTRATADA, pelo sistema ou por arquivo no layout combinado, as inclusões e exclusões de veículos, com placa, chassi, modelo e dados de contato do associado. A cobertura de cada veículo inicia-se em até 2 (dois) dias úteis do recebimento do cadastro completo e cessa na data da exclusão informada.</p>
<p><strong>3.2.</strong> A CONTRATANTE é responsável pela veracidade dos dados enviados e por informar aos seus associados as coberturas, os limites e os canais de acionamento.</p>

<h2>CLÁUSULA 4 — DO PREÇO E DO PAGAMENTO</h2>
<p><strong>4.1.</strong> Pelos serviços, a CONTRATANTE pagará mensalmente à CONTRATADA:</p>
<ul>
<li>pela assistência 24 horas, ${Valor_Assistencia_Veiculo} (${Valor_Assistencia_Veiculo_Extenso}) por veículo ativo no mês;</li>
<li>pelo rastreamento veicular, ${Valor_Rastreamento_Veiculo} (${Valor_Rastreamento_Veiculo_Extenso}) por veículo rastreado no mês.</li>
</ul>
<p><strong>4.2.</strong> O faturamento mensal observará a quantidade mínima de ${Quantidade_Minima_Veiculos} veículos ativos, ainda que a base efetiva seja inferior.</p>
<p><strong>4.3.</strong> A fatura vencerá todo dia ${Dia_Vencimento} de cada mês, com base na quantidade de veículos ativos no último dia do mês anterior, e será paga por boleto bancário ou outro meio indicado pela CONTRATADA.</p>
<p><strong>4.4.</strong> Os boletos e documentos fiscais serão enviados ao e-mail de cobrança ${Email_para_cobranca}, aos cuidados do(a) responsável financeiro(a) ${Responsavel_financeiro}, telefone ${Telefone_do_Responsavel}.</p>
<p><strong>4.5.</strong> O atraso no pagamento sujeitará a CONTRATANTE a multa de 2% (dois por cento), juros de mora de 1% (um por cento) ao mês, calculados pro rata die, e correção monetária pelo IPCA/IBGE. Atraso superior a 15 (quinze) dias autoriza a suspensão dos atendimentos, mediante aviso prévio de 5 (cinco) dias, até a regularização.</p>
<p><strong>4.6.</strong> Os valores serão reajustados a cada 12 (doze) meses, contados da data de início, pela variação acumulada do IPCA/IBGE ou, na sua extinção, pelo índice oficial que o substituir.</p>

<h2>CLÁUSULA 5 — DOS EQUIPAMENTOS DE RASTREAMENTO</h2>
<p><strong>5.1.</strong> Os equipamentos de rastreamento são cedidos em comodato e permanecem de propriedade da CONTRATADA ou de seus parceiros. Na exclusão do veículo ou no término do contrato, a CONTRATANTE viabilizará a retirada do equipamento em até 30 (trinta) dias, sob pena de pagar o valor de reposição constante da tabela vigente.</p>
<p><strong>5.2.</strong> A instalação, a manutenção e a retirada serão agendadas com o associado. Ausências injustificadas ao agendamento poderão ser cobradas conforme a tabela vigente.</p>

<h2>CLÁUSULA 6 — DO ACIONAMENTO E DOS NÍVEIS DE SERVIÇO</h2>
<p><strong>6.1.</strong> Os serviços de assistência serão acionados pela central telefônica ou pelos canais digitais informados pela CONTRATADA, 24 horas por dia, todos os dias do ano.</p>
<p><strong>6.2.</strong> A CONTRATADA envidará seus melhores esforços para que o prestador chegue ao local em até 60 (sessenta) minutos em regiões metropolitanas e em até 120 (cento e vinte) minutos nas demais localidades, ressalvadas situações de força maior, condições climáticas, de trânsito ou de acesso ao local.</p>
<p><strong>6.3.</strong> Não estão cobertos: veículos não cadastrados ou excluídos; eventos decorrentes de participação em competições, de uso ilícito ou de atos intencionais; despesas com peças, combustível e reparos; e acionamentos acima dos limites da tabela de coberturas.</p>

<h2>CLÁUSULA 7 — DAS OBRIGAÇÕES DAS PARTES</h2>
<p><strong>7.1.</strong> Cabe à CONTRATADA manter a central de atendimento e a rede de prestadores em funcionamento, fiscalizar a qualidade dos atendimentos, responder às reclamações em até 5 (cinco) dias úteis e disponibilizar mensalmente o relatório de acionamentos.</p>
<p><strong>7.2.</strong> Cabe à CONTRATANTE manter o cadastro atualizado, divulgar aos associados as condições dos serviços, encaminhar à CONTRATADA as reclamações recebidas e efetuar os pagamentos na forma ajustada.</p>

<h2>CLÁUSULA 8 — DA INDEPENDÊNCIA DAS PARTES</h2>
<p><strong>8.1.</strong> Este contrato não gera vínculo empregatício, societário ou de representação entre as partes, cabendo a cada uma arcar com os encargos de seus colaboradores e prestadores.</p>

<h2>CLÁUSULA 9 — DA PROTEÇÃO DE DADOS PESSOAIS</h2>
<p><strong>9.1.</strong> As partes cumprirão a Lei nº 13.709/2018 (LGPD). Quanto aos dados dos associados e veículos, a CONTRATANTE atua como controladora e a CONTRATADA como operadora, tratando-os somente para a prestação dos serviços, inclusive dados de localização, que serão acessados apenas para atendimento, monitoramento e recuperação do veículo.</p>
<p><strong>9.2.</strong> A CONTRATADA comunicará à CONTRATANTE, em até 48 (quarenta e oito) horas, qualquer incidente de segurança envolvendo esses dados e, ao término do contrato, os eliminará ou devolverá, ressalvadas as hipóteses legais de guarda.</p>

<h2>CLÁUSULA 10 — DA CONFIDENCIALIDADE</h2>
<p><strong>10.1.</strong> As partes manterão sigilo sobre as informações a que tiverem acesso em razão deste contrato, pelo prazo de vigência e por 5 (cinco) anos após o seu término.</p>

<h2>CLÁUSULA 11 — DA RESPONSABILIDADE</h2>
<p><strong>11.1.</strong> A CONTRATADA responde pelos danos causados diretamente ao veículo durante a execução dos serviços pela sua rede, apurados mediante vistoria. Sua responsabilidade total por danos diretos decorrentes deste contrato fica limitada ao valor pago pela CONTRATANTE nos 12 (doze) meses anteriores ao fato, ressalvados os casos de dolo ou culpa grave.</p>
<p><strong>11.2.</strong> O rastreamento é instrumento de apoio à localização e não constitui seguro ou garantia contra furto ou roubo, nem garantia de recuperação do veículo.</p>

<h2>CLÁUSULA 12 — DA RESCISÃO</h2>
<p><strong>12.1.</strong> Qualquer das partes poderá rescindir este contrato, sem justa causa, mediante aviso prévio por escrito de 60 (sessenta) dias, mantidos os serviços e os pagamentos durante esse período.</p>
<p><strong>12.2.</strong> O contrato poderá ser rescindido de imediato, por notificação, em caso de descumprimento não sanado em 15 (quinze) dias do recebimento de notificação, de recuperação judicial ou extrajudicial, falência, liquidação ou dissolução de qualquer das partes.</p>

<h2>CLÁUSULA 13 — DA CONDUTA ÉTICA E ANTICORRUPÇÃO</h2>
<p><strong>13.1.</strong> As partes declaram conhecer e se obrigam a cumprir a Lei nº 12.846/2013, abstendo-se de oferecer, prometer ou dar vantagem indevida a agente público ou privado em relação a este contrato.</p>

<h2>CLÁUSULA 14 — DAS DISPOSIÇÕES GERAIS</h2>
<p><strong>14.1.</strong> A tabela de coberturas e de preços acessórios poderá ser atualizada pela CONTRATADA mediante comunicação com 30 (trinta) dias de antecedência, assegurado à CONTRATANTE o direito de rescindir sem multa caso não concorde.</p>
<p><strong>14.2.</strong> A tolerância quanto ao descumprimento de obrigação não importará novação ou renúncia. A nulidade de uma cláusula não afetará as demais. Alterações deste contrato dependem de aditivo assinado pelas partes.</p>

<h2>CLÁUSULA 15 — DAS COMUNICAÇÕES</h2>
<p><strong>15.1.</strong> As comunicações e notificações relativas a este contrato serão feitas por escrito e enviadas, no caso da CONTRATANTE, ao e-mail ${Email} e, no caso da CONTRATADA, ao e-mail ${Contratada_Email}, considerando-se recebidas na data do envio, salvo comprovação de falha na entrega.</p>

<h2>CLÁUSULA 16 — DA ASSINATURA ELETRÔNICA</h2>
<p><strong>16.1.</strong> As partes concordam em assinar este contrato eletronicamente pela plataforma uoniSign, com identificação do signatário por código de uso único enviado ao e-mail ou celular informado, registro de data, hora, endereço IP e dispositivo e verificação da integridade do documento por código hash, admitindo esse meio como válido nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001, e reconhecem este contrato como título executivo extrajudicial, nos termos do art. 784, inciso III e § 4º, do Código de Processo Civil.</p>

<h2>CLÁUSULA 17 — DO FORO</h2>
<p><strong>17.1.</strong> Fica eleito o foro da comarca de ${Foro} para dirimir as questões oriundas deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.</p>

<p>E, por estarem justas e contratadas, as partes assinam este instrumento eletronicamente, na data registrada no relatório de assinaturas anexo.</p>$uonisign$,
  'html', true, 2,
  $uonisign$[{"chave":"Contratante","rotulo":"Razão social","tipo":"texto","grupo":"Dados da Contratante","min":3,"max":150},{"chave":"CNPJ_do_Contratante","rotulo":"CNPJ","tipo":"cnpj","grupo":"Dados da Contratante"},{"chave":"CEP","rotulo":"CEP","tipo":"cep","grupo":"Dados da Contratante"},{"chave":"Logradouro","rotulo":"Rua ou avenida","tipo":"texto","grupo":"Dados da Contratante","max":150},{"chave":"Numero","rotulo":"Número","tipo":"texto","grupo":"Dados da Contratante","max":10,"ajuda":"Aceita S/N"},{"chave":"Complemento","rotulo":"Complemento","tipo":"texto","grupo":"Dados da Contratante","obrigatorio":false,"max":60},{"chave":"Bairro","rotulo":"Bairro","tipo":"texto","grupo":"Dados da Contratante","max":80},{"chave":"Cidade","rotulo":"Cidade","tipo":"texto","grupo":"Dados da Contratante","max":80},{"chave":"Estado","rotulo":"UF","tipo":"uf","grupo":"Dados da Contratante"},{"chave":"Representante_Legal","rotulo":"Representante legal","tipo":"texto","grupo":"Dados da Contratante","min":3,"max":120,"ajuda":"Também será o signatário da Contratante"},{"chave":"Identidade","rotulo":"RG do representante","tipo":"texto","grupo":"Dados da Contratante","max":20},{"chave":"CPF","rotulo":"CPF do representante","tipo":"cpf","grupo":"Dados da Contratante"},{"chave":"Valor_Assistencia_Veiculo","rotulo":"Assistência 24h por veículo/mês (R$)","tipo":"moeda","grupo":"Valores","clausula":"4.1"},{"chave":"Valor_Rastreamento_Veiculo","rotulo":"Rastreamento por veículo/mês (R$)","tipo":"moeda","grupo":"Valores","clausula":"4.1"},{"chave":"Quantidade_Minima_Veiculos","rotulo":"Quantidade mínima de veículos","tipo":"inteiro","grupo":"Valores","clausula":"4.2","min":1,"max":1000000,"padrao":"100"},{"chave":"Dia_Vencimento","rotulo":"Dia de vencimento","tipo":"inteiro","grupo":"Valores","min":1,"max":28,"padrao":"10"},{"chave":"Email","rotulo":"E-mail da Contratante","tipo":"email","grupo":"E-mails e responsável financeiro","clausula":"15.1","ajuda":"Recebe as notificações e o convite de assinatura"},{"chave":"Email_para_cobranca","rotulo":"E-mail de cobrança","tipo":"email","grupo":"E-mails e responsável financeiro","clausula":"4.4","copiar_de":"Email"},{"chave":"Responsavel_financeiro","rotulo":"Responsável financeiro","tipo":"texto","grupo":"E-mails e responsável financeiro","max":120,"clausula":"4.4"},{"chave":"Telefone_do_Responsavel","rotulo":"Telefone do responsável financeiro","tipo":"telefone","grupo":"E-mails e responsável financeiro","clausula":"4.4"},{"chave":"Data_Inicio","rotulo":"Data de início","tipo":"data","grupo":"Vigência"},{"chave":"Prazo_Vigencia_Meses","rotulo":"Vigência (meses)","tipo":"inteiro","grupo":"Vigência","min":1,"max":120,"padrao":"12"}]$uonisign$::jsonb,
  $uonisign${"razao_social":"Vangard Gestora","cnpj":"","endereco":"","email":"contatos@vangardgestora.com.br","representante":"","foro":"Belo Horizonte/MG"}$uonisign$::jsonb,
  $uonisign${"nome":"","cpf":"","email":"","telefone":"","canais":["email"]}$uonisign$::jsonb,
  15, ARRAY[3, 7, 12],
  coalesce(
    (SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'superintendente' LIMIT 1),
    (SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin' LIMIT 1),
    (SELECT id FROM public.profiles LIMIT 1))
WHERE NOT EXISTS (SELECT 1 FROM public.contrato_templates WHERE slug = $uonisign$assistencia-24h-rastreamento$uonisign$);

INSERT INTO public.contrato_templates
  (slug, titulo, descricao, categoria, conteudo_html, tipo_template, ativo, fluxo_versao,
   campos, contratada, signatario_contratada, prazo_assinatura_dias, lembrete_dias, created_by)
SELECT $uonisign$prestacao-servicos-b2b$uonisign$, $uonisign$Prestação de Serviços — Gestão, Tecnologia e Cobrança$uonisign$, $uonisign$Vangard × associação para plataforma UONI, BI, relatórios e gestão de cobrança, sem PPR. Implantação + mensalidade.$uonisign$, $uonisign$Prestação de Serviços$uonisign$,
  $uonisign$<h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE GESTÃO, TECNOLOGIA E COBRANÇA</h1>
<p class="centro">Contrato nº ${Numero_Contrato}</p>

<p><strong>CONTRATANTE:</strong> ${Contratante}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${CNPJ_do_Contratante}, com sede em ${Endereco_Completo}, neste ato representada por ${Representante_Legal}, portador(a) do documento de identidade nº ${Identidade} e inscrito(a) no CPF sob o nº ${CPF}.</p>
<p><strong>CONTRATADA:</strong> ${Contratada_Razao_Social}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${Contratada_CNPJ}, com sede em ${Contratada_Endereco}, neste ato representada por ${Contratada_Representante}.</p>
<p>As partes acima qualificadas celebram o presente Contrato de Prestação de Serviços, que se regerá pelas cláusulas e condições a seguir.</p>

<h2>CLÁUSULA 1 — DO OBJETO</h2>
<p><strong>1.1.</strong> O presente contrato tem por objeto a prestação, pela CONTRATADA, dos seguintes serviços à CONTRATANTE: ${Servicos_Contratados}.</p>
<p><strong>1.2.</strong> Quando os serviços incluírem acesso à plataforma UONI, a CONTRATADA concede à CONTRATANTE, durante a vigência, licença de uso não exclusiva e intransferível, na modalidade de software como serviço, para o número de usuários e módulos habilitados, sem transferência de código-fonte ou de propriedade.</p>
<p><strong>1.3.</strong> Quando os serviços incluírem gestão de cobrança, a CONTRATADA atuará em nome e por conta da CONTRATANTE, segundo a política de cobrança por ela aprovada, sem assumir o risco de inadimplência dos associados e sem receber valores em nome próprio, salvo ajuste expresso.</p>

<h2>CLÁUSULA 2 — DA VIGÊNCIA</h2>
<p><strong>2.1.</strong> Este contrato vigorará pelo prazo de ${Prazo_Vigencia_Meses} meses, contados a partir de ${Data_Inicio}, renovando-se automaticamente por períodos iguais e sucessivos, salvo manifestação em contrário de qualquer das partes com antecedência mínima de 30 (trinta) dias do término do período em curso.</p>

<h2>CLÁUSULA 3 — DO PREÇO E DO PAGAMENTO</h2>
<p><strong>3.1.</strong> Pela implantação dos serviços, incluindo configuração, integração com os sistemas da CONTRATANTE e treinamento inicial, a CONTRATANTE pagará à CONTRATADA o valor único de ${Valor_Implantacao} (${Valor_Implantacao_Extenso}), com vencimento em até 10 (dez) dias da data de início.</p>
<p><strong>3.2.</strong> Pela prestação continuada dos serviços, a CONTRATANTE pagará à CONTRATADA o valor mensal de ${Valor_Mensal_Servicos} (${Valor_Mensal_Servicos_Extenso}), com vencimento todo dia ${Dia_Vencimento} de cada mês.</p>
<p><strong>3.3.</strong> Os boletos e documentos fiscais serão enviados ao e-mail de cobrança ${Email_para_cobranca}, aos cuidados do(a) responsável financeiro(a) ${Responsavel_financeiro}, telefone ${Telefone_do_Responsavel}.</p>
<p><strong>3.4.</strong> O atraso no pagamento sujeitará a CONTRATANTE a multa de 2% (dois por cento), juros de mora de 1% (um por cento) ao mês, calculados pro rata die, e correção monetária pelo IPCA/IBGE. Atraso superior a 30 (trinta) dias autoriza a suspensão dos serviços e do acesso à plataforma, mediante aviso prévio de 5 (cinco) dias, até a regularização.</p>
<p><strong>3.5.</strong> Os valores serão reajustados a cada 12 (doze) meses, contados da data de início, pela variação acumulada do IPCA/IBGE ou, na sua extinção, pelo índice oficial que o substituir.</p>
<p><strong>3.6.</strong> Serviços adicionais, novos módulos, integrações específicas e horas de desenvolvimento sob demanda serão objeto de proposta comercial própria.</p>

<h2>CLÁUSULA 4 — DOS NÍVEIS DE SERVIÇO E DO SUPORTE</h2>
<p><strong>4.1.</strong> A CONTRATADA envidará seus melhores esforços para manter a plataforma disponível em 99% (noventa e nove por cento) do tempo de cada mês, excluídas as janelas de manutenção programada, comunicadas com antecedência, e as indisponibilidades causadas por terceiros, como provedores de nuvem, sistemas de gestão de terceiros e serviços de telecomunicação.</p>
<p><strong>4.2.</strong> O suporte será prestado em dias úteis, das 9h às 18h, pelos canais informados pela CONTRATADA, com primeira resposta em até 1 (um) dia útil.</p>
<p><strong>4.3.</strong> A exatidão dos relatórios e indicadores depende da qualidade e da atualização dos dados fornecidos pela CONTRATANTE ou pelos sistemas por ela contratados.</p>

<h2>CLÁUSULA 5 — DAS OBRIGAÇÕES DAS PARTES</h2>
<p><strong>5.1.</strong> Cabe à CONTRATADA executar os serviços com diligência e por profissionais qualificados, manter backups e controles de segurança da plataforma, e informar à CONTRATANTE as indisponibilidades relevantes.</p>
<p><strong>5.2.</strong> Cabe à CONTRATANTE fornecer os acessos, credenciais de integração, informações e aprovações necessárias; zelar pelo uso adequado das credenciais de seus usuários; responder pelos atos praticados por eles na plataforma; e efetuar os pagamentos na forma ajustada.</p>

<h2>CLÁUSULA 6 — DA INDEPENDÊNCIA DAS PARTES</h2>
<p><strong>6.1.</strong> Este contrato não gera vínculo empregatício, societário ou de representação entre as partes, cabendo a cada uma arcar com os encargos de seus colaboradores.</p>

<h2>CLÁUSULA 7 — DA PROTEÇÃO DE DADOS PESSOAIS</h2>
<p><strong>7.1.</strong> As partes cumprirão a Lei nº 13.709/2018 (LGPD). Quanto aos dados pessoais de associados, colaboradores e terceiros tratados na execução dos serviços, a CONTRATANTE atua como controladora e a CONTRATADA como operadora, tratando-os somente conforme as instruções da CONTRATANTE e para as finalidades deste contrato.</p>
<p><strong>7.2.</strong> A CONTRATADA poderá utilizar suboperadores, como provedores de nuvem, envio de mensagens e e-mail, mantendo com eles obrigações de proteção de dados equivalentes às deste contrato.</p>
<p><strong>7.3.</strong> A CONTRATADA comunicará à CONTRATANTE, em até 48 (quarenta e oito) horas, qualquer incidente de segurança envolvendo esses dados e, ao término do contrato, disponibilizará a exportação dos dados por 30 (trinta) dias e depois os eliminará, ressalvadas as hipóteses legais de guarda.</p>

<h2>CLÁUSULA 8 — DA CONFIDENCIALIDADE</h2>
<p><strong>8.1.</strong> As partes manterão sigilo sobre as informações a que tiverem acesso em razão deste contrato, pelo prazo de vigência e por 5 (cinco) anos após o seu término.</p>

<h2>CLÁUSULA 9 — DA PROPRIEDADE INTELECTUAL</h2>
<p><strong>9.1.</strong> A plataforma, seus módulos, códigos, layouts, metodologias e materiais da CONTRATADA permanecem de sua exclusiva propriedade. Os dados inseridos pela CONTRATANTE permanecem de propriedade desta.</p>

<h2>CLÁUSULA 10 — DA RESPONSABILIDADE</h2>
<p><strong>10.1.</strong> A responsabilidade da CONTRATADA por danos diretos decorrentes deste contrato fica limitada ao valor total pago pela CONTRATANTE nos 12 (doze) meses anteriores ao fato, não respondendo por lucros cessantes, perda de receita ou danos indiretos, ressalvados os casos de dolo ou culpa grave.</p>

<h2>CLÁUSULA 11 — DA RESCISÃO</h2>
<p><strong>11.1.</strong> Qualquer das partes poderá rescindir este contrato, sem justa causa, mediante aviso prévio por escrito de 30 (trinta) dias, sendo devidos os valores até a data da extinção. O valor de implantação não é reembolsável.</p>
<p><strong>11.2.</strong> O contrato poderá ser rescindido de imediato, por notificação, em caso de descumprimento não sanado em 15 (quinze) dias do recebimento de notificação, de recuperação judicial ou extrajudicial, falência, liquidação ou dissolução de qualquer das partes.</p>

<h2>CLÁUSULA 12 — DA CONDUTA ÉTICA E ANTICORRUPÇÃO</h2>
<p><strong>12.1.</strong> As partes declaram conhecer e se obrigam a cumprir a Lei nº 12.846/2013, abstendo-se de oferecer, prometer ou dar vantagem indevida a agente público ou privado em relação a este contrato.</p>

<h2>CLÁUSULA 13 — DAS DISPOSIÇÕES GERAIS</h2>
<p><strong>13.1.</strong> A tolerância quanto ao descumprimento de obrigação não importará novação ou renúncia. A nulidade de uma cláusula não afetará as demais. Este contrato substitui entendimentos anteriores sobre o seu objeto e só poderá ser alterado por aditivo assinado pelas partes.</p>
<p><strong>13.2.</strong> Nenhuma das partes poderá ceder este contrato sem a anuência por escrito da outra, exceto a CONTRATADA para sociedades de seu grupo econômico, mediante comunicação à CONTRATANTE.</p>

<h2>CLÁUSULA 14 — DAS COMUNICAÇÕES</h2>
<p><strong>14.1.</strong> As comunicações e notificações relativas a este contrato serão feitas por escrito e enviadas, no caso da CONTRATANTE, ao e-mail ${Email} e, no caso da CONTRATADA, ao e-mail ${Contratada_Email}, considerando-se recebidas na data do envio, salvo comprovação de falha na entrega.</p>

<h2>CLÁUSULA 15 — DA ASSINATURA ELETRÔNICA</h2>
<p><strong>15.1.</strong> As partes concordam em assinar este contrato eletronicamente pela plataforma uoniSign, com identificação do signatário por código de uso único enviado ao e-mail ou celular informado, registro de data, hora, endereço IP e dispositivo e verificação da integridade do documento por código hash, admitindo esse meio como válido nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001, e reconhecem este contrato como título executivo extrajudicial, nos termos do art. 784, inciso III e § 4º, do Código de Processo Civil.</p>

<h2>CLÁUSULA 16 — DO FORO</h2>
<p><strong>16.1.</strong> Fica eleito o foro da comarca de ${Foro} para dirimir as questões oriundas deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.</p>

<p>E, por estarem justas e contratadas, as partes assinam este instrumento eletronicamente, na data registrada no relatório de assinaturas anexo.</p>$uonisign$,
  'html', true, 2,
  $uonisign$[{"chave":"Contratante","rotulo":"Razão social","tipo":"texto","grupo":"Dados da Contratante","min":3,"max":150},{"chave":"CNPJ_do_Contratante","rotulo":"CNPJ","tipo":"cnpj","grupo":"Dados da Contratante"},{"chave":"CEP","rotulo":"CEP","tipo":"cep","grupo":"Dados da Contratante"},{"chave":"Logradouro","rotulo":"Rua ou avenida","tipo":"texto","grupo":"Dados da Contratante","max":150},{"chave":"Numero","rotulo":"Número","tipo":"texto","grupo":"Dados da Contratante","max":10,"ajuda":"Aceita S/N"},{"chave":"Complemento","rotulo":"Complemento","tipo":"texto","grupo":"Dados da Contratante","obrigatorio":false,"max":60},{"chave":"Bairro","rotulo":"Bairro","tipo":"texto","grupo":"Dados da Contratante","max":80},{"chave":"Cidade","rotulo":"Cidade","tipo":"texto","grupo":"Dados da Contratante","max":80},{"chave":"Estado","rotulo":"UF","tipo":"uf","grupo":"Dados da Contratante"},{"chave":"Representante_Legal","rotulo":"Representante legal","tipo":"texto","grupo":"Dados da Contratante","min":3,"max":120,"ajuda":"Também será o signatário da Contratante"},{"chave":"Identidade","rotulo":"RG do representante","tipo":"texto","grupo":"Dados da Contratante","max":20},{"chave":"CPF","rotulo":"CPF do representante","tipo":"cpf","grupo":"Dados da Contratante"},{"chave":"Servicos_Contratados","rotulo":"Serviços contratados","tipo":"texto_longo","grupo":"Valores","clausula":"1.1","max":600,"padrao":"acesso à plataforma UONI, com painéis de BI e relatórios gerenciais, e gestão da cobrança dos associados"},{"chave":"Valor_Implantacao","rotulo":"Implantação (R$)","tipo":"moeda","grupo":"Valores","clausula":"3.1","permite_zero":true},{"chave":"Valor_Mensal_Servicos","rotulo":"Mensalidade (R$)","tipo":"moeda","grupo":"Valores","clausula":"3.2","soma_valor":true},{"chave":"Dia_Vencimento","rotulo":"Dia de vencimento","tipo":"inteiro","grupo":"Valores","min":1,"max":28,"padrao":"10"},{"chave":"Email","rotulo":"E-mail da Contratante","tipo":"email","grupo":"E-mails e responsável financeiro","clausula":"14.1","ajuda":"Recebe as notificações e o convite de assinatura"},{"chave":"Email_para_cobranca","rotulo":"E-mail de cobrança","tipo":"email","grupo":"E-mails e responsável financeiro","clausula":"3.3","copiar_de":"Email"},{"chave":"Responsavel_financeiro","rotulo":"Responsável financeiro","tipo":"texto","grupo":"E-mails e responsável financeiro","max":120,"clausula":"3.3"},{"chave":"Telefone_do_Responsavel","rotulo":"Telefone do responsável financeiro","tipo":"telefone","grupo":"E-mails e responsável financeiro","clausula":"3.3"},{"chave":"Data_Inicio","rotulo":"Data de início","tipo":"data","grupo":"Vigência"},{"chave":"Prazo_Vigencia_Meses","rotulo":"Vigência (meses)","tipo":"inteiro","grupo":"Vigência","min":1,"max":120,"padrao":"12"}]$uonisign$::jsonb,
  $uonisign${"razao_social":"Vangard Gestora","cnpj":"","endereco":"","email":"contatos@vangardgestora.com.br","representante":"","foro":"Belo Horizonte/MG"}$uonisign$::jsonb,
  $uonisign${"nome":"","cpf":"","email":"","telefone":"","canais":["email"]}$uonisign$::jsonb,
  15, ARRAY[3, 7, 12],
  coalesce(
    (SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'superintendente' LIMIT 1),
    (SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin' LIMIT 1),
    (SELECT id FROM public.profiles LIMIT 1))
WHERE NOT EXISTS (SELECT 1 FROM public.contrato_templates WHERE slug = $uonisign$prestacao-servicos-b2b$uonisign$);
