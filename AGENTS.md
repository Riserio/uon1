# AGENTS.md

- Radar newsletter subscribe/confirm/unsubscribe/send runs only through the `radar-newsletter` edge function; `radar_assinantes` has no anon/client write access — keeps consent records, rate limits and e-mail sending server-side.
- Public /radar reads comunicados only through the `radar_comunicados_publicos` RPC (active + `publico`), never via an anon table policy — keeps author ids and internal notices private.
- Radar newsletter e-mails send comunicados without images (user choice; hotlinked/copied images rendered broken in mail clients).
- Radar Google News links are swapped for the real article URL in two steps: the DB (pg_net) fetches the Google article page for its signature and the `radar-resolver-links` edge function does the decode POST — Google rate-limits edge/sandbox IPs on the page GET and pg_net cannot send form posts; runs hourly in small batches because bursts get 429.
