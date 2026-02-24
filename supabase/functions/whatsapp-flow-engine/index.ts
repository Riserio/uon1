import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FlowEngineRequest {
  contact_id: string;
  message_body: string;
  message_type: string;
  phone: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const metaToken = Deno.env.get('META_WHATSAPP_TOKEN');
    const metaPhoneNumberId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');

    const { contact_id, message_body, message_type, phone }: FlowEngineRequest = await req.json();
    console.log(`[flow-engine] Processing msg for contact ${contact_id}: "${message_body.substring(0, 50)}"`);

    // Check for active flow state
    const { data: activeState } = await supabase
      .from('whatsapp_contact_flow_state')
      .select('*, whatsapp_flows(*)')
      .eq('contact_id', contact_id)
      .eq('status', 'active')
      .maybeSingle();

    if (activeState) {
      await processFlowStep(supabase, activeState, message_body, contact_id, phone, metaToken!, metaPhoneNumberId!);
    } else {
      const { data: flows } = await supabase
        .from('whatsapp_flows')
        .select('*, whatsapp_flow_steps(*)')
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (!flows || flows.length === 0) {
        console.log('[flow-engine] Nenhum fluxo ativo');
        return new Response(JSON.stringify({ ok: true, matched: false }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { count: msgCount } = await supabase
        .from('whatsapp_messages')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', contact_id)
        .eq('direction', 'in');

      const isFirstMessage = (msgCount || 0) <= 1;

      for (const flow of flows) {
        const matched = matchTrigger(flow, message_body, isFirstMessage);
        if (!matched) continue;

        console.log(`[flow-engine] Fluxo matched: ${flow.name}`);

        const steps = flow.whatsapp_flow_steps || [];
        const firstStep = steps.sort((a: any, b: any) => a.step_order - b.step_order)[0];
        if (!firstStep) continue;

        const { data: newState } = await supabase
          .from('whatsapp_contact_flow_state')
          .insert({
            contact_id,
            flow_id: flow.id,
            current_step_key: firstStep.step_key,
            status: 'active',
          })
          .select()
          .single();

        if (newState) {
          await executeStep(supabase, firstStep, newState, contact_id, phone, metaToken!, metaPhoneNumberId!);
        }
        break;
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[flow-engine] Erro:', error);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function matchTrigger(flow: any, messageBody: string, isFirstMessage: boolean): boolean {
  const { trigger_type, trigger_config } = flow;

  switch (trigger_type) {
    case 'keyword': {
      const keywords: string[] = trigger_config?.keywords || [];
      const lowerMsg = messageBody.toLowerCase();
      return keywords.some((kw: string) => lowerMsg.includes(kw.toLowerCase()));
    }
    case 'first_message':
      return isFirstMessage;
    case 'all':
      return true;
    default:
      return false;
  }
}

async function processFlowStep(
  supabase: any, state: any, messageBody: string,
  contactId: string, phone: string, token: string, phoneNumberId: string
) {
  const flowId = state.flow_id;

  const { data: currentStep } = await supabase
    .from('whatsapp_flow_steps')
    .select('*')
    .eq('flow_id', flowId)
    .eq('step_key', state.current_step_key)
    .single();

  if (!currentStep) {
    await completeFlow(supabase, state.id);
    return;
  }

  // Handle ask_input: save response and advance
  if (currentStep.type === 'ask_input') {
    const varName = currentStep.config?.variable_name || 'response';
    const vars = { ...(state.variables || {}), [varName]: messageBody };
    await supabase
      .from('whatsapp_contact_flow_state')
      .update({ variables: vars, last_interaction_at: new Date().toISOString() })
      .eq('id', state.id);
    state.variables = vars;

    const nextStepKey = currentStep.next_step_key;
    if (!nextStepKey) {
      await completeFlow(supabase, state.id);
      return;
    }

    const { data: nextStep } = await supabase
      .from('whatsapp_flow_steps')
      .select('*')
      .eq('flow_id', flowId)
      .eq('step_key', nextStepKey)
      .single();

    if (!nextStep) { await completeFlow(supabase, state.id); return; }

    await supabase.from('whatsapp_contact_flow_state')
      .update({ current_step_key: nextStepKey, last_interaction_at: new Date().toISOString() })
      .eq('id', state.id);

    await executeStep(supabase, nextStep, { ...state, current_step_key: nextStepKey }, contactId, phone, token, phoneNumberId);
    return;
  }

  // Handle ask_options: match user response number to option
  if (currentStep.type === 'ask_options') {
    const options = currentStep.config?.options || [];
    const trimmed = messageBody.trim();
    const optionIndex = parseInt(trimmed, 10) - 1;

    const varName = currentStep.config?.variable_name || 'opcao_selecionada';
    let selectedOption: any = null;

    if (!isNaN(optionIndex) && optionIndex >= 0 && optionIndex < options.length) {
      selectedOption = options[optionIndex];
    } else {
      // Try matching by label text
      selectedOption = options.find((o: any) => o.label.toLowerCase() === trimmed.toLowerCase());
    }

    if (!selectedOption) {
      // Invalid option - resend question
      let retryMsg = '❌ Opção inválida. Por favor, digite o número da opção desejada:\n\n';
      options.forEach((o: any, i: number) => { retryMsg += `${i + 1}. ${o.label}\n`; });
      await sendWhatsAppMessage(supabase, contactId, phone, retryMsg, token, phoneNumberId);
      return; // Stay on same step
    }

    // Save selected option
    const vars = { ...(state.variables || {}), [varName]: selectedOption.label };
    await supabase.from('whatsapp_contact_flow_state')
      .update({ variables: vars, last_interaction_at: new Date().toISOString() })
      .eq('id', state.id);
    state.variables = vars;

    // Navigate to option's next step
    const nextStepKey = selectedOption.next_step_key;
    if (!nextStepKey) {
      await completeFlow(supabase, state.id);
      return;
    }

    const { data: nextStep } = await supabase
      .from('whatsapp_flow_steps')
      .select('*')
      .eq('flow_id', flowId)
      .eq('step_key', nextStepKey)
      .single();

    if (!nextStep) { await completeFlow(supabase, state.id); return; }

    await supabase.from('whatsapp_contact_flow_state')
      .update({ current_step_key: nextStepKey, last_interaction_at: new Date().toISOString() })
      .eq('id', state.id);

    await executeStep(supabase, nextStep, { ...state, variables: vars, current_step_key: nextStepKey }, contactId, phone, token, phoneNumberId);
    return;
  }

  // Default: advance to next step
  const nextStepKey = currentStep.next_step_key;
  if (!nextStepKey) {
    await completeFlow(supabase, state.id);
    return;
  }

  const { data: nextStep } = await supabase
    .from('whatsapp_flow_steps')
    .select('*')
    .eq('flow_id', flowId)
    .eq('step_key', nextStepKey)
    .single();

  if (!nextStep) { await completeFlow(supabase, state.id); return; }

  await supabase.from('whatsapp_contact_flow_state')
    .update({ current_step_key: nextStepKey, last_interaction_at: new Date().toISOString() })
    .eq('id', state.id);

  await executeStep(supabase, nextStep, { ...state, current_step_key: nextStepKey }, contactId, phone, token, phoneNumberId);
}

async function executeStep(
  supabase: any, step: any, state: any,
  contactId: string, phone: string, token: string, phoneNumberId: string
) {
  console.log(`[flow-engine] Executing step: ${step.step_key} (${step.type})`);

  switch (step.type) {
    case 'send_text': {
      const text = replaceVariables(step.config?.message || '', state.variables || {});
      await sendWhatsAppMessage(supabase, contactId, phone, text, token, phoneNumberId);

      if (step.next_step_key) {
        const { data: nextStep } = await supabase
          .from('whatsapp_flow_steps')
          .select('*')
          .eq('flow_id', state.flow_id)
          .eq('step_key', step.next_step_key)
          .single();

        if (nextStep && !['ask_input', 'ask_options', 'wait'].includes(nextStep.type)) {
          await supabase.from('whatsapp_contact_flow_state')
            .update({ current_step_key: step.next_step_key })
            .eq('id', state.id);
          await executeStep(supabase, nextStep, { ...state, current_step_key: step.next_step_key }, contactId, phone, token, phoneNumberId);
        } else if (nextStep) {
          await supabase.from('whatsapp_contact_flow_state')
            .update({ current_step_key: step.next_step_key })
            .eq('id', state.id);
          if (nextStep.type === 'ask_input') {
            const question = replaceVariables(nextStep.config?.message || '', state.variables || {});
            await sendWhatsAppMessage(supabase, contactId, phone, question, token, phoneNumberId);
          } else if (nextStep.type === 'ask_options') {
            let optionsMsg = replaceVariables(nextStep.config?.message || '', state.variables || {});
            const options = nextStep.config?.options || [];
            if (options.length > 0) {
              optionsMsg += '\n';
              options.forEach((o: any, i: number) => { optionsMsg += `\n${i + 1}. ${o.label}`; });
            }
            await sendWhatsAppMessage(supabase, contactId, phone, optionsMsg, token, phoneNumberId);
          }
        }
      } else {
        await completeFlow(supabase, state.id);
      }
      break;
    }

    case 'ask_input': {
      // Question already sent by previous step's auto-advance or initial execution
      const question = replaceVariables(step.config?.message || '', state.variables || {});
      await sendWhatsAppMessage(supabase, contactId, phone, question, token, phoneNumberId);
      break;
    }

    case 'ask_options': {
      let optionsMsg = replaceVariables(step.config?.message || '', state.variables || {});
      const options = step.config?.options || [];
      if (options.length > 0) {
        optionsMsg += '\n';
        options.forEach((o: any, i: number) => { optionsMsg += `\n${i + 1}. ${o.label}`; });
      }
      await sendWhatsAppMessage(supabase, contactId, phone, optionsMsg, token, phoneNumberId);
      // Wait for user response
      break;
    }

    case 'request_report': {
      // Check if phone is authorized (registered in whatsapp_config destination numbers)
      const cleanPhone = phone.replace(/\D/g, '');
      const phoneWithout55 = cleanPhone.startsWith('55') ? cleanPhone.substring(2) : cleanPhone;

      const { data: configs } = await supabase
        .from('whatsapp_config')
        .select('telefone_whatsapp, corretora_id')
        .eq('ativo', true);

      let authorized = false;
      let corretoraId: string | null = null;

      if (configs) {
        for (const cfg of configs) {
          const numbers = (cfg.telefone_whatsapp || '').split(',').map((n: string) => n.replace(/\D/g, ''));
          if (numbers.some((n: string) => n === phoneWithout55 || n === cleanPhone || `55${n}` === cleanPhone)) {
            authorized = true;
            corretoraId = cfg.corretora_id;
            break;
          }
        }
      }

      if (!authorized) {
        const denyMsg = replaceVariables(step.config?.deny_message || '⚠️ Você não tem permissão para solicitar relatórios. Entre em contato com sua associação para liberação.', state.variables || {});
        await sendWhatsAppMessage(supabase, contactId, phone, denyMsg, token, phoneNumberId);
        await completeFlow(supabase, state.id);
        return;
      }

      // Send confirmation
      const confirmMsg = replaceVariables(step.config?.message || '📊 Gerando relatório...', state.variables || {});
      await sendWhatsAppMessage(supabase, contactId, phone, confirmMsg, token, phoneNumberId);

      // Trigger report generation
      const reportType = step.config?.report_type || 'cobranca';
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

        let fnName = '';
        if (reportType === 'cobranca') fnName = 'gerar-resumo-cobranca';
        else if (reportType === 'eventos') fnName = 'gerar-resumo-eventos';
        else fnName = 'gerar-resumo-cobranca';

        const reportResp = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': anonKey,
            'Authorization': `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ corretora_id: corretoraId }),
        });

        if (!reportResp.ok) {
          console.error('[flow-engine] Report generation failed');
          await sendWhatsAppMessage(supabase, contactId, phone, '⚠️ Não foi possível gerar o relatório no momento. Tente novamente mais tarde.', token, phoneNumberId);
        }
      } catch (err) {
        console.error('[flow-engine] Report error:', err);
      }

      if (step.next_step_key) {
        const { data: nextStep } = await supabase
          .from('whatsapp_flow_steps')
          .select('*')
          .eq('flow_id', state.flow_id)
          .eq('step_key', step.next_step_key)
          .single();
        if (nextStep) {
          await supabase.from('whatsapp_contact_flow_state')
            .update({ current_step_key: step.next_step_key })
            .eq('id', state.id);
          await executeStep(supabase, nextStep, { ...state, current_step_key: step.next_step_key }, contactId, phone, token, phoneNumberId);
        } else {
          await completeFlow(supabase, state.id);
        }
      } else {
        await completeFlow(supabase, state.id);
      }
      break;
    }

    case 'deny_unauthorized': {
      const cleanPhone = phone.replace(/\D/g, '');
      const phoneWithout55 = cleanPhone.startsWith('55') ? cleanPhone.substring(2) : cleanPhone;

      const { data: configs } = await supabase
        .from('whatsapp_config')
        .select('telefone_whatsapp')
        .eq('ativo', true);

      let authorized = false;
      if (configs) {
        for (const cfg of configs) {
          const numbers = (cfg.telefone_whatsapp || '').split(',').map((n: string) => n.replace(/\D/g, ''));
          if (numbers.some((n: string) => n === phoneWithout55 || n === cleanPhone || `55${n}` === cleanPhone)) {
            authorized = true;
            break;
          }
        }
      }

      if (!authorized) {
        const denyMsg = replaceVariables(step.config?.message || '⚠️ Você não tem permissão. Solicite acesso à sua associação.', state.variables || {});
        await sendWhatsAppMessage(supabase, contactId, phone, denyMsg, token, phoneNumberId);
      }

      if (step.next_step_key) {
        const { data: nextStep } = await supabase
          .from('whatsapp_flow_steps')
          .select('*')
          .eq('flow_id', state.flow_id)
          .eq('step_key', step.next_step_key)
          .single();
        if (nextStep) {
          await supabase.from('whatsapp_contact_flow_state')
            .update({ current_step_key: step.next_step_key })
            .eq('id', state.id);
          await executeStep(supabase, nextStep, { ...state, current_step_key: step.next_step_key }, contactId, phone, token, phoneNumberId);
        }
      } else {
        await completeFlow(supabase, state.id);
      }
      break;
    }

    case 'transfer_human': {
      await supabase
        .from('whatsapp_contacts')
        .update({ human_mode: true, human_mode_at: new Date().toISOString() })
        .eq('id', contactId);

      const notifText = step.config?.message || '🧑‍💼 Você será atendido por um de nossos atendentes. Aguarde um momento.';
      await sendWhatsAppMessage(supabase, contactId, phone, notifText, token, phoneNumberId);
      await completeFlow(supabase, state.id);
      break;
    }

    case 'end': {
      if (step.config?.message) {
        const text = replaceVariables(step.config.message, state.variables || {});
        await sendWhatsAppMessage(supabase, contactId, phone, text, token, phoneNumberId);
      }
      await completeFlow(supabase, state.id);
      break;
    }

    case 'set_variable': {
      const vars = { ...(state.variables || {}), [step.config?.variable_name]: step.config?.value };
      await supabase.from('whatsapp_contact_flow_state')
        .update({ variables: vars })
        .eq('id', state.id);

      if (step.next_step_key) {
        const { data: nextStep } = await supabase
          .from('whatsapp_flow_steps')
          .select('*')
          .eq('flow_id', state.flow_id)
          .eq('step_key', step.next_step_key)
          .single();

        if (nextStep) {
          await supabase.from('whatsapp_contact_flow_state')
            .update({ current_step_key: step.next_step_key })
            .eq('id', state.id);
          await executeStep(supabase, nextStep, { ...state, variables: vars, current_step_key: step.next_step_key }, contactId, phone, token, phoneNumberId);
        }
      }
      break;
    }
  }
}

function replaceVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
  }
  return result;
}

async function completeFlow(supabase: any, stateId: string) {
  await supabase
    .from('whatsapp_contact_flow_state')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', stateId);
}

async function sendWhatsAppMessage(
  supabase: any, contactId: string, phone: string,
  text: string, token: string, phoneNumberId: string
) {
  const formattedPhone = phone.startsWith('55') ? phone : `55${phone}`;

  const metaResponse = await fetch(
    `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'text',
        text: { preview_url: false, body: text },
      }),
    }
  );

  const metaData = await metaResponse.json();
  const metaMessageId = metaData.messages?.[0]?.id || null;

  await supabase
    .from('whatsapp_messages')
    .insert({
      contact_id: contactId,
      direction: 'out',
      body: text,
      type: 'text',
      status: metaResponse.ok ? 'sent' : 'failed',
      meta_message_id: metaMessageId,
      error_message: !metaResponse.ok ? (metaData?.error?.message || 'Erro API') : null,
      raw_payload: metaData,
    });

  await supabase
    .from('whatsapp_contacts')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: text.substring(0, 100),
    })
    .eq('id', contactId);

  if (!metaResponse.ok) {
    console.error('[flow-engine] Erro ao enviar:', metaData);
  }
}
