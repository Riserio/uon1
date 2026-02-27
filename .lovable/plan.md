

## Analysis of "Reativação de Janela 24h" Flow

### Current Flow Structure
```text
Step 0: send_text (delay: 12h, quiet: 21:00-06:30)
   ↓ next
Step 1: ask_options ("Quer ver relatório?")
   ├─ "Sim" → Step 2: end
   └─ "Não" → Step 3: end

Step 4: send_text (delay: window_end_60m, quiet: 21:00-06:30)  ← ORPHANED
   ↓ next
Step 1: ask_options (same)
```

### Problems Found

**1. Step 4 (window_end_60m) is orphaned** - No other step points to it. It will never execute because the flow starts at step 0 and step 0's next is step 1 (ask_options), not step 4.

**2. Scheduled message advances immediately** - When step 0 schedules the 12h message, the engine immediately advances to step 1 (ask_options) and sends the options message RIGHT AWAY, before the 12h message is even delivered. The user would receive the options question without context.

**3. No "if no response" logic** - The engine doesn't have a mechanism to wait for a response timeout and then escalate to step 4. Once the ask_options is sent, it just waits indefinitely (up to the timeout).

**4. Quiet hours conflict** - The window_end_60m message at ~23h of the last interaction would fall in quiet hours (21:00-06:30), getting pushed to 06:30 next day, which is AFTER the 24h window expires → message would be marked as expired and never sent.

### About Testing Now
Your last incoming message was at **23:16 BRT (Feb 26)**. If I trigger the flow now:
- 12h delay → scheduled for ~11:16 BRT Feb 27 ✓ (outside quiet hours)
- window_end_60m → scheduled for ~22:16 BRT Feb 27, but falls in quiet hours (21:00) → pushed to 06:30 Feb 28 → PAST 24h window → expired ✗

### Proposed Fix

**A. Fix engine: don't advance past scheduled steps** - When a send_text has a delay, schedule it AND keep the flow state pointing to that step. The `whatsapp-scheduled-sender` function, after actually sending the message, should advance the flow to the next step.

**B. Add `wait_response` step type** - A new step that waits for X time; if no response arrives, advances to a "timeout" branch instead of the normal next step. This enables the "if no response, try again" pattern.

**C. Restructure the flow** to:
```text
Step 0: send_text (delay: 12h)
   ↓ (after message is actually sent by scheduled-sender)
Step 1: wait_response (timeout: 11h, next_on_response → ask_options, next_on_timeout → step 4)
Step 4: send_text (delay: window_end_60m, NO quiet hours since it must send before window closes)
   ↓
Step 5: ask_options
```

**D. Remove quiet hours from the window_end_60m step** - The whole point is to send 1h before the window closes; quiet hours would make it expire.

### Implementation Steps

1. **Update `whatsapp-scheduled-sender`** to advance flow state after sending a scheduled message (look up the flow state by contact_id + flow_id, advance to next_step_key, and execute the next step if needed)
2. **Update `executeStep` in flow engine** to NOT advance to next step when a message is scheduled with delay — let the scheduled-sender handle progression
3. **Add `wait_response` step type** to the flow engine and UI editor with timeout + timeout_next_step_key config
4. **Trigger test** via the flow engine edge function for contact `a8636286-4ce2-4747-a0b5-4f672f1f1a9b`

