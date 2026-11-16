# AGENTS.md

- Radar newsletter subscribe/confirm/unsubscribe/send runs only through the `radar-newsletter` edge function; `radar_assinantes` has no anon/client write access — keeps consent records, rate limits and e-mail sending server-side.
