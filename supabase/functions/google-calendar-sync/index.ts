import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
    const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(JSON.stringify({ 
        code: 401, 
        message: 'Missing authorization header' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid user' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: integration, error: integrationError } = await supabase
      .from('google_calendar_integrations')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (integrationError || !integration) {
      return new Response(JSON.stringify({ error: 'Google Calendar not connected' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let accessToken = integration.access_token;
    const expiresAt = new Date(integration.token_expires_at);
    
    if (expiresAt <= new Date()) {
      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID!,
          client_secret: GOOGLE_CLIENT_SECRET!,
          refresh_token: integration.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      if (!refreshResponse.ok) {
        return new Response(JSON.stringify({ error: 'Token refresh failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const tokens = await refreshResponse.json();
      accessToken = tokens.access_token;
      const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      await supabase
        .from('google_calendar_integrations')
        .update({
          access_token: accessToken,
          token_expires_at: newExpiresAt,
        })
        .eq('user_id', user.id);
    }

    // IMPORT from Google Calendar
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneMonthAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const googleCalendarResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` + 
      `timeMin=${oneMonthAgo.toISOString()}&` +
      `timeMax=${oneMonthAhead.toISOString()}&` +
      `singleEvents=true&` +
      `orderBy=startTime`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    let importedCount = 0;
    let updatedCount = 0;

    if (googleCalendarResponse.ok) {
      const googleEvents = await googleCalendarResponse.json();

      for (const googleEvent of googleEvents.items || []) {
        try {
          if (!googleEvent.start?.dateTime || !googleEvent.end?.dateTime) continue;

          const { data: existingEvent } = await supabase
            .from('eventos')
            .select('*')
            .eq('google_event_id', googleEvent.id)
            .eq('user_id', user.id)
            .single();

          const eventData = {
            user_id: user.id,
            titulo: googleEvent.summary || 'Sem título',
            descricao: googleEvent.description || null,
            local: googleEvent.location || googleEvent.hangoutLink || null,
            data_inicio: googleEvent.start.dateTime,
            data_fim: googleEvent.end.dateTime,
            google_event_id: googleEvent.id,
            tipo: googleEvent.conferenceData?.conferenceSolution?.name ? 'reuniao' : 'outro',
            cor: '#3b82f6',
            lembrete_minutos: googleEvent.reminders?.overrides?.map((r: any) => r.minutes) || [15, 30],
          };

          if (existingEvent) {
            await supabase.from('eventos').update(eventData).eq('id', existingEvent.id);
            updatedCount++;
          } else {
            await supabase.from('eventos').insert([eventData]);
            importedCount++;
          }
        } catch (error) {
          console.error(`Error importing event:`, error);
        }
      }
    }

    // EXPORT to Google Calendar
    const { data: eventos } = await supabase
      .from('eventos')
      .select('*')
      .eq('user_id', user.id);

    let syncedCount = 0;
    const errors = [];

    for (const evento of eventos || []) {
      try {
        const googleEvent = {
          summary: evento.titulo,
          description: evento.descricao || '',
          location: evento.local || '',
          start: { dateTime: evento.data_inicio, timeZone: 'America/Sao_Paulo' },
          end: { dateTime: evento.data_fim, timeZone: 'America/Sao_Paulo' },
          reminders: {
            useDefault: false,
            overrides: (evento.lembrete_minutos || []).map((minutes: number) => ({
              method: 'popup',
              minutes,
            })),
          },
        };

        let response;
        
        if (evento.google_event_id) {
          response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${evento.google_event_id}`,
            {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(googleEvent),
            }
          );
        } else {
          response = await fetch(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events',
            {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(googleEvent),
            }
          );
        }

        if (response.ok) {
          const googleEventData = await response.json();
          await supabase.from('eventos').update({ google_event_id: googleEventData.id }).eq('id', evento.id);
          syncedCount++;
        } else {
          errors.push({ id: evento.id, error: await response.text() });
        }
      } catch (error) {
        errors.push({ id: evento.id, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    await supabase
      .from('google_calendar_integrations')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', user.id);

    return new Response(JSON.stringify({ 
      success: true, 
      imported: importedCount,
      updated: updatedCount,
      synced: syncedCount,
      totalEvents: eventos?.length || 0,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in google-calendar-sync:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
