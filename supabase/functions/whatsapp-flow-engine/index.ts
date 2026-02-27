import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FlowEngineRequest {
  contact_id?: string;
  message_body?: string;
  message_type?: string;
  phone?: string;
  // Auto-import trigger fields
  contact_phone?: string;
  flow_id?: string;
  trigger?: string;
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

    const body: FlowEngineRequest = await req.json();

    // ========== AUTO-IMPORT TRIGGER MODE ==========
    if (body.trigger === 'auto_import' && body.flow_id && body.contact_phone) {
      console.log(`[flow-engine] Auto-import trigger for flow ${body.flow_id}, phone ${body.contact_phone}`);
      
      const cleanPhone = body.contact_phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

      // Find or create contact
      let contactId: string;
      const { data: existingContact } = await supabase
        .from('whatsapp_contacts')
        .select('id')
        .eq('phone', formattedPhone)
        .maybeSingle();

      if (existingContact) {
        contactId = existingContact.id;
      } else {
        const { data: newContact } = await supabase
          .from('whatsapp_contacts')
          .insert({ phone: formattedPhone, name: formattedPhone })
          .select('id')
          .single();
        if (!newContact) {
          throw new Error('Failed to create contact');
        }
        contactId = newContact.id;
      }

      // Load flow and first step
      const { data: flow } = await supabase
        .from('whatsapp_flows')
        .select('*, whatsapp_flow_steps(*)')
        .eq('id', body.flow_id)
        .single();

      if (!flow) {
        console.error(`[flow-engine] Flow ${body.flow_id} not found`);
        return new Response(JSON.stringify({ ok: false, error: 'Flow not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const steps = flow.whatsapp_flow_steps || [];
      const firstStep = steps.sort((a: any, b: any) => a.step_order - b.step_order)[0];
      if (!firstStep) {
        return new Response(JSON.stringify({ ok: false, error: 'No steps in flow' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Expire any existing active state so the new import flow can start fresh
      const { data: existingStates } = await supabase
        .from('whatsapp_contact_flow_state')
        .select('id')
        .eq('contact_id', contactId)
        .eq('status', 'active');

      if (existingStates && existingStates.length > 0) {
        const ids = existingStates.map((s: any) => s.id);
        console.log(`[flow-engine] Auto-import: expiring ${ids.length} existing active state(s) for contact ${contactId}`);
        await supabase
          .from('whatsapp_contact_flow_state')
          .update({ status: 'expired', completed_at: new Date().toISOString() })
          .in('id', ids);
      }

      // Create flow state and execute
      const { data: newState } = await supabase
        .from('whatsapp_contact_flow_state')
        .insert({
          contact_id: contactId,
          flow_id: flow.id,
          current_step_key: firstStep.step_key,
          status: 'active',
        })
        .select()
        .single();

      if (newState) {
        await executeStep(supabase, firstStep, newState, contactId, formattedPhone, metaToken!, metaPhoneNumberId!);
      }

      return new Response(JSON.stringify({ ok: true, mode: 'auto_import' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== NORMAL MESSAGE PROCESSING MODE ==========
    const { contact_id, message_body, phone } = body;
    if (!contact_id || !message_body || !phone) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing required fields' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log(`[flow-engine] Processing msg for contact ${contact_id}: "${message_body.substring(0, 50)}"`);

    // Load reset config from whatsapp_config (per-corretora or global defaults)
    let resetKeywords = ['reiniciar', 'menu', 'voltar', 'sair', '0'];
    let timeoutMinutos = 30;
    {
      const { data: configs } = await supabase
        .from('whatsapp_config')
        .select('reset_keywords, timeout_minutos')
        .eq('ativo', true)
        .limit(10);
      if (configs && configs.length > 0) {
        // Use first config that has values set
        const cfg = configs.find((c: any) => c.reset_keywords && c.reset_keywords.length > 0) || configs[0];
        if (cfg.reset_keywords && cfg.reset_keywords.length > 0) resetKeywords = cfg.reset_keywords;
        if (cfg.timeout_minutos) timeoutMinutos = cfg.timeout_minutos;
      }
    }
    const isResetCommand = resetKeywords.includes(normalizeText(message_body));

    // Check for active flow state(s) — handle multiple actives defensively
    let activeState: any = null;
    {
      const { data: activeStates } = await supabase
        .from('whatsapp_contact_flow_state')
        .select('*, whatsapp_flows(*)')
        .eq('contact_id', contact_id)
        .eq('status', 'active')
        .order('started_at', { ascending: false });

      if (activeStates && activeStates.length > 1) {
        // Expire all but the most recent
        const toExpire = activeStates.slice(1).map((s: any) => s.id);
        console.log(`[flow-engine] Found ${activeStates.length} active states for contact ${contact_id}, expiring ${toExpire.length} old ones`);
        const { error: expErr } = await supabase
          .from('whatsapp_contact_flow_state')
          .update({ status: 'expired', completed_at: new Date().toISOString() })
          .in('id', toExpire);
        if (expErr) console.error(`[flow-engine] Error expiring duplicate states:`, expErr);
      }
      activeState = activeStates?.[0] || null;
    }

    // Handle reset command: expire active state and fall through to trigger matching
    if (activeState && isResetCommand) {
      console.log(`[flow-engine] Reset command "${message_body}" — expiring state ${activeState.id}`);
      const { error: resetErr } = await supabase.from('whatsapp_contact_flow_state')
        .update({ status: 'expired', completed_at: new Date().toISOString() })
        .eq('id', activeState.id);
      if (resetErr) console.error(`[flow-engine] RESET FAILED for state ${activeState.id}:`, resetErr);
      else console.log(`[flow-engine] State ${activeState.id} expired successfully via reset`);
      await sendWhatsAppMessage(supabase, contact_id, phone, '🔄 Fluxo reiniciado com sucesso! Envie sua mensagem novamente para começar.', metaToken!, metaPhoneNumberId!);
      // Fall through to try matching new triggers below
    }
    // Auto-expire stale active states
    else if (activeState) {
      const lastInteraction = activeState.last_interaction_at || activeState.started_at;
      const staleMs = Date.now() - new Date(lastInteraction).getTime();
      const STALE_THRESHOLD_MS = timeoutMinutos * 60 * 1000;
      if (staleMs > STALE_THRESHOLD_MS) {
        console.log(`[flow-engine] Auto-expiring stale state ${activeState.id} (${Math.round(staleMs / 60000)}min old, threshold: ${timeoutMinutos}min)`);
        const { error: timeoutErr } = await supabase.from('whatsapp_contact_flow_state')
          .update({ status: 'expired', completed_at: new Date().toISOString() })
          .eq('id', activeState.id);
        if (timeoutErr) console.error(`[flow-engine] TIMEOUT EXPIRE FAILED for state ${activeState.id}:`, timeoutErr);
        else console.log(`[flow-engine] State ${activeState.id} expired successfully via timeout`);
        // Fall through to try matching new triggers
      } else {
        console.log(`[flow-engine] Active state found: ${activeState.id}, step: ${activeState.current_step_key}`);
        await processFlowStep(supabase, activeState, message_body, contact_id, phone, metaToken!, metaPhoneNumberId!);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // No active state (or expired) - try to match triggers
    {
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

      console.log(`[flow-engine] Checking ${flows.length} flows for message: "${message_body}"`);
      for (const flow of flows) {
        const matched = matchTrigger(flow, message_body, isFirstMessage);
        console.log(`[flow-engine] Flow "${flow.name}" (trigger: ${flow.trigger_type}, keywords: ${JSON.stringify(flow.trigger_config?.keywords || [])}) → ${matched ? 'MATCH' : 'no match'}`);
        if (!matched) continue;

        console.log(`[flow-engine] ✅ Fluxo matched: ${flow.name}`);

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

function normalizeText(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .trim();
}

// Robust Brazilian phone matching: handles 9th digit variation
// e.g. webhook: 553183131491 (no 9th digit) vs config: 31983131491 (with 9th digit)
function phonesMatch(phoneA: string, phoneB: string): boolean {
  const a = phoneA.replace(/\D/g, '');
  const b = phoneB.replace(/\D/g, '');
  if (!a || !b) return false;
  // Exact match
  if (a === b) return true;
  // Match by last 11, 10 digits
  if (a.slice(-11) === b.slice(-11)) return true;
  if (a.slice(-10) === b.slice(-10)) return true;
  // Handle 9th digit variation: compare last 8 digits (subscriber number without 9th digit prefix)
  // Extract area code + 8-digit number from both
  const aLast8 = a.slice(-8);
  const bLast8 = b.slice(-8);
  // Get area code: for 55XXNNNNNNNN format, area code is digits 2-4 from right of (length-8)
  const aArea = a.length >= 10 ? a.slice(-10, -8) : a.slice(-10, -8);
  const bArea = b.length >= 10 ? b.slice(-10, -8) : b.slice(-10, -8);
  // Same area code + same last 8 digits = match (handles 9th digit difference)
  if (aArea === bArea && aLast8 === bLast8) return true;
  // Fallback: just compare last 8 digits (less strict but catches edge cases)
  if (aLast8 === bLast8 && aArea && bArea) return true;
  return false;
}

function matchTrigger(flow: any, messageBody: string, isFirstMessage: boolean): boolean {
  const { trigger_type, trigger_config } = flow;

  switch (trigger_type) {
    case 'keyword': {
      const keywords: string[] = trigger_config?.keywords || [];
      const normMsg = normalizeText(messageBody);
      return keywords.some((kw: string) => {
        const normKw = normalizeText(kw);
        // Bidirectional: message contains keyword OR keyword contains message word
        return normMsg.includes(normKw) || normKw.includes(normMsg);
      });
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

  // Handle virtual step: confirm last updated association or pick from list
  if (state.current_step_key === '__confirm_last_corretora') {
    const corretoras = JSON.parse(state.variables?._pending_report_corretoras || '[]');
    const reportType = state.variables?._pending_report_type || 'cobranca';
    const nextStepKey = state.variables?._pending_report_step_next || null;
    const lastCorretora = state.variables?._last_updated_corretora ? JSON.parse(state.variables._last_updated_corretora) : null;
    const trimmed = normalizeText(messageBody);

    if (trimmed === '1' || trimmed === 'sim' || trimmed === 's') {
      // User confirmed the last updated association
      if (lastCorretora) {
        console.log(`[flow-engine] User confirmed last corretora: ${lastCorretora.nome}`);
        await sendWhatsAppMessage(supabase, contactId, phone, `📊 Gerando relatório de *${lastCorretora.nome}*...`, token, phoneNumberId);
        await triggerReportGeneration(supabase, reportType, lastCorretora.id, phone, contactId, token, phoneNumberId);

        // Ask if they want another
        const vars = { ...(state.variables || {}), corretora_selecionada: lastCorretora.nome };
        const otherCorretoras = corretoras.filter((c: any) => c.id !== lastCorretora.id);
        if (otherCorretoras.length > 0) {
          vars._remaining_corretoras = JSON.stringify(otherCorretoras);
          await supabase.from('whatsapp_contact_flow_state')
            .update({ current_step_key: '__ask_another_corretora', variables: vars, last_interaction_at: new Date().toISOString() })
            .eq('id', state.id);
          await sendWhatsAppMessage(supabase, contactId, phone, '\n🔄 Deseja ver o relatório de outra associação?\n\n1. Sim\n2. Não', token, phoneNumberId);
        } else {
          await advanceOrComplete(supabase, state, nextStepKey, flowId, vars, contactId, phone, token, phoneNumberId);
        }
        return;
      }
    }
    
    if (trimmed === '2' || trimmed === 'nao' || trimmed === 'não' || trimmed === 'n' || trimmed === 'outra' || trimmed === 'outras') {
      // User wants to see the full list — go to selection
      await supabase.from('whatsapp_contact_flow_state')
        .update({ current_step_key: '__select_corretora_report', last_interaction_at: new Date().toISOString() })
        .eq('id', state.id);
      let listMsg = '📋 Selecione a associação:\n';
      corretoras.forEach((c: any, i: number) => {
        const status = c.last_update ? `✅ ${c.last_update}` : '⚠️ sem dados';
        listMsg += `\n${i + 1}. ${c.nome} (${status})`;
      });
      listMsg += '\n\nDigite o número da opção desejada.';
      await sendWhatsAppMessage(supabase, contactId, phone, listMsg, token, phoneNumberId);
      return;
    }

    // Invalid response
    await sendWhatsAppMessage(supabase, contactId, phone, '❌ Resposta inválida. Digite *1* para Sim ou *2* para ver outras associações.', token, phoneNumberId);
    return;
  }

  // Handle virtual step: ask if user wants another association report
  if (state.current_step_key === '__ask_another_corretora') {
    const remaining = JSON.parse(state.variables?._remaining_corretoras || '[]');
    const corretoras = JSON.parse(state.variables?._pending_report_corretoras || '[]');
    const reportType = state.variables?._pending_report_type || 'cobranca';
    const nextStepKey = state.variables?._pending_report_step_next || null;
    const trimmed = normalizeText(messageBody);

    if (trimmed === '1' || trimmed === 'sim' || trimmed === 's') {
      // Show remaining list
      await supabase.from('whatsapp_contact_flow_state')
        .update({ current_step_key: '__select_corretora_report', last_interaction_at: new Date().toISOString() })
        .eq('id', state.id);
      let listMsg = '📋 Selecione a associação:\n';
      corretoras.forEach((c: any, i: number) => {
        const status = c.last_update ? `✅ ${c.last_update}` : '⚠️ sem dados';
        listMsg += `\n${i + 1}. ${c.nome} (${status})`;
      });
      listMsg += '\n\nDigite o número da opção desejada.';
      await sendWhatsAppMessage(supabase, contactId, phone, listMsg, token, phoneNumberId);
      return;
    }

    if (trimmed === '2' || trimmed === 'nao' || trimmed === 'não' || trimmed === 'n') {
      const cleanVars = { ...(state.variables || {}) };
      delete cleanVars._pending_report_corretoras;
      delete cleanVars._pending_report_type;
      delete cleanVars._pending_report_step_next;
      delete cleanVars._last_updated_corretora;
      delete cleanVars._remaining_corretoras;
      await advanceOrComplete(supabase, state, nextStepKey, flowId, cleanVars, contactId, phone, token, phoneNumberId);
      return;
    }

    await sendWhatsAppMessage(supabase, contactId, phone, '❌ Resposta inválida. Digite *1* para Sim ou *2* para Não.', token, phoneNumberId);
    return;
  }

  // Handle virtual step: corretora selection for multi-association reports
  if (state.current_step_key === '__select_corretora_report') {
    const corretoras = JSON.parse(state.variables?._pending_report_corretoras || '[]');
    const reportType = state.variables?._pending_report_type || 'cobranca';
    const nextStepKey = state.variables?._pending_report_step_next || null;
    const trimmed = messageBody.trim();
    const optionIndex = parseInt(trimmed, 10) - 1;

    if (isNaN(optionIndex) || optionIndex < 0 || optionIndex >= corretoras.length) {
      let retryMsg = '❌ Opção inválida. Digite o número da associação:\n';
      corretoras.forEach((c: any, i: number) => {
        const status = c.last_update ? `✅ ${c.last_update}` : '⚠️ sem dados';
        retryMsg += `\n${i + 1}. ${c.nome} (${status})`;
      });
      await sendWhatsAppMessage(supabase, contactId, phone, retryMsg, token, phoneNumberId);
      return;
    }

    const selected = corretoras[optionIndex];
    console.log(`[flow-engine] User selected corretora: ${selected.nome} (${selected.id})`);

    await sendWhatsAppMessage(supabase, contactId, phone, `📊 Gerando relatório de *${selected.nome}*...`, token, phoneNumberId);
    await triggerReportGeneration(supabase, reportType, selected.id, phone, contactId, token, phoneNumberId);

    // Ask if they want another
    const vars = { ...(state.variables || {}), corretora_selecionada: selected.nome };
    const otherCorretoras = corretoras.filter((c: any) => c.id !== selected.id);
    if (otherCorretoras.length > 0) {
      vars._remaining_corretoras = JSON.stringify(otherCorretoras);
      await supabase.from('whatsapp_contact_flow_state')
        .update({ current_step_key: '__ask_another_corretora', variables: vars, last_interaction_at: new Date().toISOString() })
        .eq('id', state.id);
      await sendWhatsAppMessage(supabase, contactId, phone, '\n🔄 Deseja ver o relatório de outra associação?\n\n1. Sim\n2. Não', token, phoneNumberId);
    } else {
      const cleanVars = { ...vars };
      delete cleanVars._pending_report_corretoras;
      delete cleanVars._pending_report_type;
      delete cleanVars._pending_report_step_next;
      delete cleanVars._last_updated_corretora;
      delete cleanVars._remaining_corretoras;
      await advanceOrComplete(supabase, state, nextStepKey, flowId, cleanVars, contactId, phone, token, phoneNumberId);
    }
    return;
  }

  // Fallback: redirect pending corretora variables to the correct virtual step handler
  if (state.variables?._pending_report_corretoras) {
    const currentKey = state.current_step_key;
    // Determine correct virtual step based on context
    let redirectKey = '__select_corretora_report';
    if (state.variables?._last_updated_corretora && currentKey !== '__select_corretora_report' && currentKey !== '__ask_another_corretora') {
      redirectKey = '__confirm_last_corretora';
    }
    console.log(`[flow-engine] Redirecting pending corretora selection to ${redirectKey}`);
    await supabase.from('whatsapp_contact_flow_state')
      .update({ current_step_key: redirectKey, last_interaction_at: new Date().toISOString() })
      .eq('id', state.id);
    state.current_step_key = redirectKey;
    return await processFlowStep(supabase, state, messageBody, contactId, phone, token, phoneNumberId);
  }

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

  // Handle wait_response: user responded while in wait state → go to response branch
  if (currentStep.type === 'wait_response') {
    console.log(`[flow-engine] wait_response: user responded! Advancing to next_step_key: ${currentStep.next_step_key}`);
    // Cancel the timeout scheduled message
    await supabase.from('whatsapp_scheduled_messages')
      .update({ status: 'expired', error_message: 'Usuário respondeu antes do timeout' })
      .eq('contact_id', contactId)
      .eq('flow_id', flowId)
      .eq('step_key', currentStep.step_key)
      .eq('status', 'pending');
    // Clean wait variables
    const vars = { ...(state.variables || {}) };
    delete vars._wait_response_until;
    delete vars._wait_response_step;
    // Advance to the "response" branch (next_step_key)
    const nextStepKey = currentStep.next_step_key;
    if (!nextStepKey) { await completeFlow(supabase, state.id); return; }
    const { data: nextStep } = await supabase.from('whatsapp_flow_steps').select('*')
      .eq('flow_id', flowId).eq('step_key', nextStepKey).single();
    if (!nextStep) { await completeFlow(supabase, state.id); return; }
    await supabase.from('whatsapp_contact_flow_state')
      .update({ current_step_key: nextStepKey, variables: vars, last_interaction_at: new Date().toISOString() })
      .eq('id', state.id);
    await executeStep(supabase, nextStep, { ...state, variables: vars, current_step_key: nextStepKey }, contactId, phone, token, phoneNumberId);
    return;
  }

  // Handle pending scheduled step: user sent a message while waiting for a scheduled message
  if (state.variables?._pending_scheduled_step) {
    console.log(`[flow-engine] User sent message while waiting for scheduled step ${state.variables._pending_scheduled_step}, processing as normal interaction`);
    // Cancel pending scheduled messages for this step
    await supabase.from('whatsapp_scheduled_messages')
      .update({ status: 'expired', error_message: 'Usuário interagiu antes do envio agendado' })
      .eq('contact_id', contactId)
      .eq('flow_id', flowId)
      .eq('step_key', state.variables._pending_scheduled_step)
      .eq('status', 'pending');
    const vars = { ...(state.variables || {}) };
    delete vars._pending_scheduled_step;
    await supabase.from('whatsapp_contact_flow_state')
      .update({ variables: vars, last_interaction_at: new Date().toISOString() })
      .eq('id', state.id);
    state.variables = vars;
    // Fall through to normal processing — the flow will be re-evaluated with new triggers
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
      // Try matching by label text (case-insensitive, accent-insensitive)
      const normTrimmed = normalizeText(trimmed);
      selectedOption = options.find((o: any) => normalizeText(o.label) === normTrimmed);
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

  // Check if step has schedule_time - queue instead of sending immediately
  const scheduleTime = step.config?.schedule_time;
  if (scheduleTime && ['send_text', 'request_report'].includes(step.type)) {
    const text = replaceVariables(step.config?.message || '', state.variables || {});
    const quietStart = step.config?.quiet_start || null;
    const quietEnd = step.config?.quiet_end || null;
    const scheduled = await scheduleMessage(supabase, contactId, phone, text, scheduleTime, state.flow_id, step.step_key, quietStart, quietEnd);
    if (scheduled) {
      console.log(`[flow-engine] Message scheduled for ${scheduleTime} — flow state stays on step ${step.step_key}, scheduled-sender will advance after delivery`);
      // DON'T advance — keep flow state pointing to this step
      // The whatsapp-scheduled-sender will advance the flow after actually sending
      const vars = { ...(state.variables || {}), _pending_scheduled_step: step.step_key };
      await supabase.from('whatsapp_contact_flow_state')
        .update({ variables: vars, last_interaction_at: new Date().toISOString() })
        .eq('id', state.id);
      return;
    }
  }

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

        if (nextStep && !['ask_input', 'ask_options', 'wait_response'].includes(nextStep.type)) {
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
      // Check if phone is authorized - collect ALL matching associations
      console.log(`[flow-engine] Auth check - phone: ${phone}`);

      const { data: configs } = await supabase
        .from('whatsapp_config')
        .select('telefone_whatsapp, corretora_id, corretoras(nome)')
        .eq('ativo', true);

      // Collect all matching corretoras
      const matchedCorretoras: { id: string; nome: string }[] = [];

      if (configs) {
        for (const cfg of configs) {
          const numbers = (cfg.telefone_whatsapp || '').split(',').map((n: string) => n.trim()).filter(Boolean);
          for (const n of numbers) {
            if (phonesMatch(phone, n)) {
              const nome = (cfg as any).corretoras?.nome || 'Associação';
              if (!matchedCorretoras.find(c => c.id === cfg.corretora_id)) {
                matchedCorretoras.push({ id: cfg.corretora_id, nome });
              }
              break;
            }
          }
        }
      }
      console.log(`[flow-engine] Auth result: matched=${matchedCorretoras.length} corretoras: ${matchedCorretoras.map(c => c.nome).join(', ')}`);

      if (matchedCorretoras.length === 0) {
        const denyMsg = replaceVariables(step.config?.deny_message || '⚠️ Você não tem permissão para solicitar relatórios. Entre em contato com sua associação para liberação.', state.variables || {});
        await sendWhatsAppMessage(supabase, contactId, phone, denyMsg, token, phoneNumberId);
        await completeFlow(supabase, state.id);
        return;
      }

      const reportType = step.config?.report_type || 'cobranca';

      if (matchedCorretoras.length === 1) {
        // Single association - generate directly
        const corretoraId = matchedCorretoras[0].id;
        const confirmMsg = replaceVariables(step.config?.message || '📊 Gerando relatório...', state.variables || {});
        await sendWhatsAppMessage(supabase, contactId, phone, confirmMsg, token, phoneNumberId);
        await triggerReportGeneration(supabase, reportType, corretoraId, phone, contactId, token, phoneNumberId);
      } else {
        // Multiple associations - fetch last update dates for each
        const importTable = reportType === 'eventos' ? 'sga_importacoes' : reportType === 'mgf' ? 'mgf_importacoes' : 'cobranca_importacoes';
        const enrichedCorretoras = [];
        for (const c of matchedCorretoras) {
          const { data: lastImport } = await supabase
            .from(importTable)
            .select('created_at')
            .eq('corretora_id', c.id)
            .eq('ativo', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          const lastUpdate = lastImport?.created_at
            ? new Date(lastImport.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
            : null;
          enrichedCorretoras.push({ ...c, last_update: lastUpdate });
        }

        // Sort: most recently updated first
        enrichedCorretoras.sort((a: any, b: any) => {
          if (!a.last_update && !b.last_update) return 0;
          if (!a.last_update) return 1;
          if (!b.last_update) return -1;
          return 0; // keep relative order since already sorted by name
        });

        const mostRecent = enrichedCorretoras.find((c: any) => c.last_update);

        const vars = {
          ...(state.variables || {}),
          _pending_report_corretoras: JSON.stringify(enrichedCorretoras),
          _pending_report_type: reportType,
          _pending_report_step_next: step.next_step_key || '',
        };

        if (mostRecent) {
          // Show the last updated and ask for confirmation
          vars._last_updated_corretora = JSON.stringify(mostRecent);
          await supabase.from('whatsapp_contact_flow_state')
            .update({ variables: vars, current_step_key: '__confirm_last_corretora', last_interaction_at: new Date().toISOString() })
            .eq('id', state.id);

          const menuMsg = `📋 Você está vinculado a *${enrichedCorretoras.length}* associações.\n\n` +
            `A última atualização foi de *${mostRecent.nome}* em ${mostRecent.last_update}.\n\n` +
            `Deseja ver o relatório desta associação?\n\n1. ✅ Sim, gerar de *${mostRecent.nome}*\n2. 📋 Ver todas as associações`;
          await sendWhatsAppMessage(supabase, contactId, phone, menuMsg, token, phoneNumberId);
        } else {
          // No updates found - show full list
          await supabase.from('whatsapp_contact_flow_state')
            .update({ variables: vars, current_step_key: '__select_corretora_report', last_interaction_at: new Date().toISOString() })
            .eq('id', state.id);

          let menuMsg = '📋 Você está vinculado a múltiplas associações. Selecione:\n';
          enrichedCorretoras.forEach((c: any, i: number) => {
            menuMsg += `\n${i + 1}. ${c.nome} (⚠️ sem dados)`;
          });
          menuMsg += '\n\nDigite o número da opção desejada.';
          await sendWhatsAppMessage(supabase, contactId, phone, menuMsg, token, phoneNumberId);
        }
        return; // Wait for user response
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
      const { data: configs } = await supabase
        .from('whatsapp_config')
        .select('telefone_whatsapp')
        .eq('ativo', true);

      let authorized = false;
      if (configs) {
        for (const cfg of configs) {
          const numbers = (cfg.telefone_whatsapp || '').split(',').map((n: string) => n.trim()).filter(Boolean);
          for (const n of numbers) {
            if (phonesMatch(phone, n)) {
              authorized = true;
              break;
            }
          }
          if (authorized) break;
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

    case 'wait_response': {
      // Schedule a timeout check — store when wait started and the timeout duration
      const timeoutMs = parseDelayMs(step.config?.timeout || '11h');
      const waitUntil = new Date(Date.now() + timeoutMs).toISOString();
      const vars = { ...(state.variables || {}), _wait_response_until: waitUntil, _wait_response_step: step.step_key };
      await supabase.from('whatsapp_contact_flow_state')
        .update({ variables: vars, last_interaction_at: new Date().toISOString() })
        .eq('id', state.id);
      console.log(`[flow-engine] wait_response: waiting until ${waitUntil} for response, timeout_next: ${step.config?.timeout_next_step_key}`);
      // If step has a message, send it
      if (step.config?.message) {
        const text = replaceVariables(step.config.message, state.variables || {});
        await sendWhatsAppMessage(supabase, contactId, phone, text, token, phoneNumberId);
      }
      // Schedule a timeout check message so the scheduled-sender can trigger timeout branch
      await supabase.from('whatsapp_scheduled_messages').insert({
        contact_id: contactId,
        phone,
        message: '__WAIT_RESPONSE_TIMEOUT__',
        scheduled_for: waitUntil,
        flow_id: state.flow_id,
        step_key: step.step_key,
      });
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

async function triggerReportGeneration(
  supabase: any, reportType: string, corretoraId: string,
  phone: string, contactId: string, token: string, phoneNumberId: string
) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    let fnName = '';
    if (reportType === 'cobranca') fnName = 'gerar-resumo-cobranca';
    else if (reportType === 'eventos') fnName = 'gerar-resumo-eventos';
    else fnName = 'gerar-resumo-cobranca';

    const reportResp = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ corretora_id: corretoraId, phone, contact_id: contactId }),
    });

    if (!reportResp.ok) {
      console.error(`[flow-engine] Report generation failed: ${reportResp.status}`);
      await sendWhatsAppMessage(supabase, contactId, phone, '⚠️ Não foi possível gerar o relatório no momento. Tente novamente mais tarde.', token, phoneNumberId);
      return;
    }

    const reportData = await reportResp.json();
    if (reportData.success && reportData.resumo) {
      console.log(`[flow-engine] Report generated successfully, sending to ${phone}`);
      await sendWhatsAppMessage(supabase, contactId, phone, reportData.resumo, token, phoneNumberId);
    } else {
      console.error(`[flow-engine] Report returned error: ${reportData.error || 'unknown'}`);
      await sendWhatsAppMessage(supabase, contactId, phone, `⚠️ Erro ao gerar relatório: ${reportData.error || 'Tente novamente mais tarde.'}`, token, phoneNumberId);
    }
  } catch (err) {
    console.error('[flow-engine] Report error:', err);
    await sendWhatsAppMessage(supabase, contactId, phone, '⚠️ Erro inesperado ao gerar relatório. Tente novamente mais tarde.', token, phoneNumberId);
  }
}

function replaceVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
  }
  return result;
}

function parseDelayMs(delay: string): number {
  const match = delay.match(/^(\d+)(m|h)$/);
  if (!match) return 11 * 60 * 60 * 1000; // default 11h
  const value = parseInt(match[1]);
  const unit = match[2];
  return unit === 'h' ? value * 60 * 60 * 1000 : value * 60 * 1000;
}

async function advanceOrComplete(
  supabase: any, state: any, nextStepKey: string | null, flowId: string,
  vars: Record<string, any>, contactId: string, phone: string, token: string, phoneNumberId: string
) {
  if (nextStepKey) {
    const { data: nextStep } = await supabase
      .from('whatsapp_flow_steps').select('*')
      .eq('flow_id', flowId).eq('step_key', nextStepKey).single();
    if (nextStep) {
      await supabase.from('whatsapp_contact_flow_state')
        .update({ current_step_key: nextStepKey, variables: vars, last_interaction_at: new Date().toISOString() })
        .eq('id', state.id);
      await executeStep(supabase, nextStep, { ...state, variables: vars, current_step_key: nextStepKey }, contactId, phone, token, phoneNumberId);
    } else {
      await completeFlow(supabase, state.id);
    }
  } else {
    await completeFlow(supabase, state.id);
  }
}

async function completeFlow(supabase: any, stateId: string) {
  const { error } = await supabase
    .from('whatsapp_contact_flow_state')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', stateId);
  if (error) {
    console.error(`[flow-engine] completeFlow FAILED for state ${stateId}:`, error);
    // Fallback: try 'expired' instead
    const { error: fallbackErr } = await supabase
      .from('whatsapp_contact_flow_state')
      .update({ status: 'expired', completed_at: new Date().toISOString() })
      .eq('id', stateId);
    if (fallbackErr) console.error(`[flow-engine] completeFlow fallback also FAILED:`, fallbackErr);
  } else {
    console.log(`[flow-engine] Flow state ${stateId} completed successfully`);
  }
}

async function scheduleMessage(
  supabase: any, contactId: string, phone: string,
  message: string, scheduleTime: string, flowId: string, stepKey: string,
  quietStart: string | null = null, quietEnd: string | null = null
): Promise<boolean> {
  try {
    // Parse delay format: "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "window_end_10m", "window_end_60m"
    // Also support legacy HH:MM format for backwards compatibility

    // First, get last incoming message (needed for all modes)
    const { data: lastIncoming } = await supabase
      .from('whatsapp_messages')
      .select('created_at')
      .eq('contact_id', contactId)
      .eq('direction', 'in')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastIncoming) {
      console.log(`[flow-engine] No incoming message found, sending immediately`);
      return false;
    }

    const lastMsgTime = new Date(lastIncoming.created_at).getTime();
    const windowEnd = lastMsgTime + 24 * 60 * 60 * 1000;
    let scheduledTime: Date;

    if (scheduleTime === 'window_end_10m' || scheduleTime === 'window_end_60m') {
      const minutesBefore = scheduleTime === 'window_end_60m' ? 60 : 10;
      scheduledTime = new Date(windowEnd - minutesBefore * 60 * 1000);
      if (scheduledTime <= new Date()) {
        console.log(`[flow-engine] Window end -${minutesBefore}min already passed, sending immediately`);
        return false;
      }
    } else {
      let delayMs = 0;
      
      if (scheduleTime.includes(':')) {
        // Legacy HH:MM format
        const [hours, minutes] = scheduleTime.split(':').map(Number);
        const scheduled = new Date();
        const spOffset = -3;
        const utcHours = hours - spOffset;
        scheduled.setUTCHours(utcHours, minutes, 0, 0);
        if (scheduled <= new Date()) {
          scheduled.setDate(scheduled.getDate() + 1);
        }
        delayMs = scheduled.getTime() - Date.now();
      } else {
        const match = scheduleTime.match(/^(\d+)(m|h)$/);
        if (!match) {
          console.error(`[flow-engine] Invalid schedule format: ${scheduleTime}`);
          return false;
        }
        const value = parseInt(match[1]);
        const unit = match[2];
        delayMs = unit === 'h' ? value * 60 * 60 * 1000 : value * 60 * 1000;
      }

      scheduledTime = new Date(lastMsgTime + delayMs);
      if (scheduledTime <= new Date()) {
        console.log(`[flow-engine] Delay ${scheduleTime} already elapsed, sending immediately`);
        return false;
      }
      if (scheduledTime.getTime() > windowEnd) {
        console.log(`[flow-engine] Delay ${scheduleTime} would exceed 24h window, sending immediately`);
        return false;
      }
    }

    // Apply quiet hours: if scheduledTime falls in quiet window, push to quiet_end
    if (quietStart && quietEnd) {
      const spOffset = -3 * 60 * 60 * 1000; // Brasília UTC-3
      const spTime = new Date(scheduledTime.getTime() + spOffset);
      const spHour = spTime.getUTCHours();
      const spMin = spTime.getUTCMinutes();
      const spMins = spHour * 60 + spMin;

      const [qsH, qsM] = quietStart.split(':').map(Number);
      const [qeH, qeM] = quietEnd.split(':').map(Number);
      const qsMins = qsH * 60 + qsM;
      const qeMins = qeH * 60 + qeM;

      let inQuiet = false;
      if (qsMins > qeMins) {
        // Overnight: e.g. 22:00 - 08:00
        inQuiet = spMins >= qsMins || spMins < qeMins;
      } else {
        inQuiet = spMins >= qsMins && spMins < qeMins;
      }

      if (inQuiet) {
        // Push to quiet_end on the same day (or next day if overnight)
        const pushed = new Date(scheduledTime);
        const pushedSp = new Date(pushed.getTime() + spOffset);
        pushedSp.setUTCHours(qeH, qeM, 0, 0);
        // If quiet end is earlier than current SP time, it means next day
        if (pushedSp.getTime() <= spTime.getTime()) {
          pushedSp.setUTCDate(pushedSp.getUTCDate() + 1);
        }
        // Convert back from SP to UTC
        scheduledTime = new Date(pushedSp.getTime() - spOffset);
        console.log(`[flow-engine] Quiet hours ${quietStart}-${quietEnd}, pushed to ${scheduledTime.toISOString()}`);

        // Verify still within 24h window
        if (scheduledTime.getTime() > windowEnd) {
          console.log(`[flow-engine] Pushed time exceeds 24h window, sending immediately`);
          return false;
        }
      }
    }

    await supabase.from('whatsapp_scheduled_messages').insert({
      contact_id: contactId,
      phone,
      message,
      scheduled_for: scheduledTime.toISOString(),
      flow_id: flowId,
      step_key: stepKey,
    });

    console.log(`[flow-engine] Message scheduled for ${scheduledTime.toISOString()} (delay: ${scheduleTime})`);
    return true;
  } catch (err) {
    console.error('[flow-engine] Schedule error:', err);
    return false;
  }
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
