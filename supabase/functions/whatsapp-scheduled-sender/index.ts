import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const metaToken = Deno.env.get('META_WHATSAPP_TOKEN')!;
    const metaPhoneNumberId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID')!;

    // Get pending messages whose scheduled time has passed
    const { data: pendingMessages, error } = await supabase
      .from('whatsapp_scheduled_messages')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(50);

    if (error) throw error;
    if (!pendingMessages || pendingMessages.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[scheduled-sender] Processing ${pendingMessages.length} scheduled messages`);
    let sentCount = 0;

    for (const msg of pendingMessages) {
      try {
        // Check if this is a wait_response timeout marker
        if (msg.message === '__WAIT_RESPONSE_TIMEOUT__') {
          console.log(`[scheduled-sender] Processing wait_response timeout for contact ${msg.contact_id}, step ${msg.step_key}`);
          await handleWaitResponseTimeout(supabase, msg, metaToken, metaPhoneNumberId);
          await supabase.from('whatsapp_scheduled_messages')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', msg.id);
          sentCount++;
          continue;
        }

        // Verify 24h window is still open
        const { data: lastIncoming } = await supabase
          .from('whatsapp_messages')
          .select('created_at')
          .eq('contact_id', msg.contact_id)
          .eq('direction', 'in')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastIncoming) {
          const windowEnd = new Date(lastIncoming.created_at).getTime() + 24 * 60 * 60 * 1000;
          if (Date.now() > windowEnd) {
            // Window expired - mark as expired
            await supabase.from('whatsapp_scheduled_messages')
              .update({ status: 'expired', error_message: 'Janela de 24h expirada' })
              .eq('id', msg.id);
            console.log(`[scheduled-sender] Message ${msg.id} expired (24h window)`);
            continue;
          }
        }

        // Send via Meta API
        const formattedPhone = msg.phone.startsWith('55') ? msg.phone : `55${msg.phone}`;
        const metaResponse = await fetch(
          `https://graph.facebook.com/v22.0/${metaPhoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${metaToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: formattedPhone,
              type: 'text',
              text: { preview_url: false, body: msg.message },
            }),
          }
        );

        const metaData = await metaResponse.json();

        if (metaResponse.ok) {
          const metaMessageId = metaData.messages?.[0]?.id || null;

          // Log in whatsapp_messages
          await supabase.from('whatsapp_messages').insert({
            contact_id: msg.contact_id,
            direction: 'out',
            body: msg.message,
            type: 'text',
            status: 'sent',
            meta_message_id: metaMessageId,
          });

          // Update contact
          await supabase.from('whatsapp_contacts').update({
            last_message_at: new Date().toISOString(),
            last_message_preview: msg.message.substring(0, 100),
          }).eq('id', msg.contact_id);

          // Mark as sent
          await supabase.from('whatsapp_scheduled_messages')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', msg.id);

          sentCount++;
          console.log(`[scheduled-sender] Sent message ${msg.id}`);

          // ===== ADVANCE FLOW STATE after sending =====
          if (msg.flow_id && msg.step_key) {
            await advanceFlowAfterSend(supabase, msg, metaToken, metaPhoneNumberId);
          }
        } else {
          const errorMsg = metaData?.error?.message || 'Erro API Meta';
          await supabase.from('whatsapp_scheduled_messages')
            .update({ status: 'failed', error_message: errorMsg })
            .eq('id', msg.id);
          console.error(`[scheduled-sender] Failed message ${msg.id}: ${errorMsg}`);
        }
      } catch (msgErr: any) {
        await supabase.from('whatsapp_scheduled_messages')
          .update({ status: 'failed', error_message: msgErr.message })
          .eq('id', msg.id);
        console.error(`[scheduled-sender] Error processing ${msg.id}:`, msgErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: sentCount, total: pendingMessages.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[scheduled-sender] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * After a scheduled message is sent, advance the flow state to the next step.
 */
async function advanceFlowAfterSend(supabase: any, msg: any, metaToken: string, metaPhoneNumberId: string) {
  try {
    // Find the active flow state for this contact + flow
    const { data: state } = await supabase
      .from('whatsapp_contact_flow_state')
      .select('*')
      .eq('contact_id', msg.contact_id)
      .eq('flow_id', msg.flow_id)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!state) {
      console.log(`[scheduled-sender] No active flow state for contact ${msg.contact_id}, flow ${msg.flow_id}`);
      return;
    }

    // Verify this is the step we're waiting on
    if (state.current_step_key !== msg.step_key && state.variables?._pending_scheduled_step !== msg.step_key) {
      console.log(`[scheduled-sender] Flow state step ${state.current_step_key} doesn't match scheduled step ${msg.step_key}, skipping advance`);
      return;
    }

    // Get the current step to find next_step_key
    const { data: currentStep } = await supabase
      .from('whatsapp_flow_steps')
      .select('*')
      .eq('flow_id', msg.flow_id)
      .eq('step_key', msg.step_key)
      .single();

    if (!currentStep) {
      console.log(`[scheduled-sender] Step ${msg.step_key} not found in flow ${msg.flow_id}`);
      return;
    }

    // Clean _pending_scheduled_step variable
    const vars = { ...(state.variables || {}) };
    delete vars._pending_scheduled_step;

    const nextStepKey = currentStep.next_step_key;
    if (!nextStepKey) {
      // No next step — complete flow
      await supabase.from('whatsapp_contact_flow_state')
        .update({ status: 'completed', completed_at: new Date().toISOString(), variables: vars })
        .eq('id', state.id);
      console.log(`[scheduled-sender] Flow completed after scheduled message`);
      return;
    }

    // Get next step
    const { data: nextStep } = await supabase
      .from('whatsapp_flow_steps')
      .select('*')
      .eq('flow_id', msg.flow_id)
      .eq('step_key', nextStepKey)
      .single();

    if (!nextStep) {
      await supabase.from('whatsapp_contact_flow_state')
        .update({ status: 'completed', completed_at: new Date().toISOString(), variables: vars })
        .eq('id', state.id);
      return;
    }

    // Update flow state to next step
    await supabase.from('whatsapp_contact_flow_state')
      .update({ current_step_key: nextStepKey, variables: vars, last_interaction_at: new Date().toISOString() })
      .eq('id', state.id);

    console.log(`[scheduled-sender] Advanced flow to step ${nextStepKey} (${nextStep.type})`);

    // Execute the next step via the flow engine
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // For steps that need execution (send_text, wait_response, etc.), call the flow engine
    if (['send_text', 'end', 'wait_response', 'request_report', 'set_variable', 'transfer_human', 'deny_unauthorized'].includes(nextStep.type)) {
      // Execute inline for simpler step types
      if (nextStep.type === 'wait_response') {
        // Schedule the timeout for wait_response
        const timeoutMs = parseDelayMs(nextStep.config?.timeout || '11h');
        const waitUntil = new Date(Date.now() + timeoutMs).toISOString();
        const newVars = { ...vars, _wait_response_until: waitUntil, _wait_response_step: nextStep.step_key };
        await supabase.from('whatsapp_contact_flow_state')
          .update({ variables: newVars })
          .eq('id', state.id);
        // Send optional message
        if (nextStep.config?.message) {
          const phone = msg.phone.startsWith('55') ? msg.phone : `55${msg.phone}`;
          await sendMessage(phone, nextStep.config.message, metaToken, metaPhoneNumberId, supabase, msg.contact_id);
        }
        // Schedule timeout check
        await supabase.from('whatsapp_scheduled_messages').insert({
          contact_id: msg.contact_id,
          phone: msg.phone,
          message: '__WAIT_RESPONSE_TIMEOUT__',
          scheduled_for: waitUntil,
          flow_id: msg.flow_id,
          step_key: nextStep.step_key,
        });
        console.log(`[scheduled-sender] wait_response scheduled timeout at ${waitUntil}`);
      } else if (nextStep.type === 'send_text') {
        // Check if this step also has a schedule_time
        if (nextStep.config?.schedule_time) {
          // Re-schedule via flow engine by storing as pending
          const newVars = { ...vars, _pending_scheduled_step: nextStep.step_key };
          await supabase.from('whatsapp_contact_flow_state')
            .update({ current_step_key: nextStep.step_key, variables: newVars })
            .eq('id', state.id);
          // Call flow engine to schedule
          await fetch(`${supabaseUrl}/functions/v1/whatsapp-flow-engine`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
            body: JSON.stringify({ trigger: 'execute_step', contact_id: msg.contact_id, flow_id: msg.flow_id, step_key: nextStep.step_key }),
          });
        } else {
          const phone = msg.phone.startsWith('55') ? msg.phone : `55${msg.phone}`;
          await sendMessage(phone, nextStep.config?.message || '', metaToken, metaPhoneNumberId, supabase, msg.contact_id);
          // Continue advancing if next step isn't interactive
          if (nextStep.next_step_key) {
            // Recursive advance for non-interactive steps
            await advanceFlowAfterSend(supabase, { ...msg, step_key: nextStep.step_key }, metaToken, metaPhoneNumberId);
          } else {
            await supabase.from('whatsapp_contact_flow_state')
              .update({ status: 'completed', completed_at: new Date().toISOString() })
              .eq('id', state.id);
          }
        }
      } else if (nextStep.type === 'end') {
        if (nextStep.config?.message) {
          const phone = msg.phone.startsWith('55') ? msg.phone : `55${msg.phone}`;
          await sendMessage(phone, nextStep.config.message, metaToken, metaPhoneNumberId, supabase, msg.contact_id);
        }
        await supabase.from('whatsapp_contact_flow_state')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', state.id);
      } else if (nextStep.type === 'ask_options') {
        // Send the options question
        let optionsMsg = nextStep.config?.message || '';
        const options = nextStep.config?.options || [];
        if (options.length > 0) {
          optionsMsg += '\n';
          options.forEach((o: any, i: number) => { optionsMsg += `\n${i + 1}. ${o.label}`; });
        }
        const phone = msg.phone.startsWith('55') ? msg.phone : `55${msg.phone}`;
        await sendMessage(phone, optionsMsg, metaToken, metaPhoneNumberId, supabase, msg.contact_id);
      } else if (nextStep.type === 'ask_input') {
        const phone = msg.phone.startsWith('55') ? msg.phone : `55${msg.phone}`;
        await sendMessage(phone, nextStep.config?.message || '', metaToken, metaPhoneNumberId, supabase, msg.contact_id);
      }
    } else if (['ask_input', 'ask_options'].includes(nextStep.type)) {
      // Send the question and wait for response
      const phone = msg.phone.startsWith('55') ? msg.phone : `55${msg.phone}`;
      let text = nextStep.config?.message || '';
      if (nextStep.type === 'ask_options') {
        const options = nextStep.config?.options || [];
        if (options.length > 0) {
          text += '\n';
          options.forEach((o: any, i: number) => { text += `\n${i + 1}. ${o.label}`; });
        }
      }
      await sendMessage(phone, text, metaToken, metaPhoneNumberId, supabase, msg.contact_id);
    }
  } catch (err) {
    console.error(`[scheduled-sender] Error advancing flow:`, err);
  }
}

/**
 * Handle wait_response timeout: advance to the timeout branch
 */
async function handleWaitResponseTimeout(supabase: any, msg: any, metaToken: string, metaPhoneNumberId: string) {
  try {
    const { data: state } = await supabase
      .from('whatsapp_contact_flow_state')
      .select('*')
      .eq('contact_id', msg.contact_id)
      .eq('flow_id', msg.flow_id)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!state) {
      console.log(`[scheduled-sender] No active flow state for timeout check`);
      return;
    }

    // Verify we're still on the wait_response step
    if (state.current_step_key !== msg.step_key) {
      console.log(`[scheduled-sender] Flow already advanced past wait_response step ${msg.step_key} (now at ${state.current_step_key}), skipping timeout`);
      return;
    }

    // Get the wait_response step config
    const { data: waitStep } = await supabase
      .from('whatsapp_flow_steps')
      .select('*')
      .eq('flow_id', msg.flow_id)
      .eq('step_key', msg.step_key)
      .single();

    if (!waitStep || waitStep.type !== 'wait_response') {
      console.log(`[scheduled-sender] Step ${msg.step_key} is not wait_response`);
      return;
    }

    const timeoutNextStepKey = waitStep.config?.timeout_next_step_key;
    if (!timeoutNextStepKey) {
      console.log(`[scheduled-sender] No timeout_next_step_key configured, completing flow`);
      await supabase.from('whatsapp_contact_flow_state')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', state.id);
      return;
    }

    // Clean wait variables
    const vars = { ...(state.variables || {}) };
    delete vars._wait_response_until;
    delete vars._wait_response_step;

    // Advance to timeout branch
    const { data: timeoutStep } = await supabase
      .from('whatsapp_flow_steps')
      .select('*')
      .eq('flow_id', msg.flow_id)
      .eq('step_key', timeoutNextStepKey)
      .single();

    if (!timeoutStep) {
      await supabase.from('whatsapp_contact_flow_state')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', state.id);
      return;
    }

    await supabase.from('whatsapp_contact_flow_state')
      .update({ current_step_key: timeoutNextStepKey, variables: vars, last_interaction_at: new Date().toISOString() })
      .eq('id', state.id);

    console.log(`[scheduled-sender] wait_response timeout → advancing to ${timeoutNextStepKey} (${timeoutStep.type})`);

    // Execute the timeout step
    await advanceFlowAfterSend(supabase, { ...msg, step_key: timeoutNextStepKey }, metaToken, metaPhoneNumberId);
  } catch (err) {
    console.error(`[scheduled-sender] Error handling wait_response timeout:`, err);
  }
}

function parseDelayMs(delay: string): number {
  const match = delay.match(/^(\d+)(m|h)$/);
  if (!match) return 11 * 60 * 60 * 1000;
  const value = parseInt(match[1]);
  const unit = match[2];
  return unit === 'h' ? value * 60 * 60 * 1000 : value * 60 * 1000;
}

async function sendMessage(
  phone: string, text: string, token: string, phoneNumberId: string,
  supabase: any, contactId: string
) {
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
        to: phone,
        type: 'text',
        text: { preview_url: false, body: text },
      }),
    }
  );

  const metaData = await metaResponse.json();
  const metaMessageId = metaData.messages?.[0]?.id || null;

  await supabase.from('whatsapp_messages').insert({
    contact_id: contactId,
    direction: 'out',
    body: text,
    type: 'text',
    status: metaResponse.ok ? 'sent' : 'failed',
    meta_message_id: metaMessageId,
  });

  await supabase.from('whatsapp_contacts').update({
    last_message_at: new Date().toISOString(),
    last_message_preview: text.substring(0, 100),
  }).eq('id', contactId);

  if (!metaResponse.ok) {
    console.error('[scheduled-sender] Send error:', metaData);
  }
}
