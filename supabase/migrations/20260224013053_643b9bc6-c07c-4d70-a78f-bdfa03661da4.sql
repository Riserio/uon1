ALTER TABLE public.whatsapp_flow_steps DROP CONSTRAINT whatsapp_flow_steps_type_check;
ALTER TABLE public.whatsapp_flow_steps ADD CONSTRAINT whatsapp_flow_steps_type_check 
  CHECK (type = ANY (ARRAY[
    'send_text'::text, 'send_template'::text, 'ask_input'::text, 'ask_options'::text,
    'condition'::text, 'transfer_human'::text, 'end'::text, 'wait'::text, 
    'set_variable'::text, 'request_report'::text, 'deny_unauthorized'::text
  ]));