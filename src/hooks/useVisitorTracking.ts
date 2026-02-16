import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

function getSessionId(): string {
  let sid = sessionStorage.getItem("visitor_session_id");
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem("visitor_session_id", sid);
  }
  return sid;
}

function detectDevice(): { device_type: string; browser: string; os: string } {
  const ua = navigator.userAgent;

  // Device type
  let device_type = "desktop";
  if (/Mobi|Android/i.test(ua)) device_type = "mobile";
  else if (/Tablet|iPad/i.test(ua)) device_type = "tablet";

  // Browser
  let browser = "Outro";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome/i.test(ua)) browser = "Chrome";
  else if (/Firefox/i.test(ua)) browser = "Firefox";
  else if (/Safari/i.test(ua)) browser = "Safari";
  else if (/Opera|OPR/i.test(ua)) browser = "Opera";

  // OS
  let os = "Outro";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iOS|iPhone|iPad/i.test(ua)) os = "iOS";

  return { device_type, browser, os };
}

export function useVisitorTracking() {
  const location = useLocation();
  const pageStartTime = useRef(Date.now());
  const lastPage = useRef<string | null>(null);
  const lastLogId = useRef<string | null>(null);

  useEffect(() => {
    const trackPageView = async () => {
      // Don't track the same page twice in a row
      if (lastPage.current === location.pathname) return;

      // Update duration of previous page
      if (lastLogId.current && lastPage.current) {
        const duration = Math.round((Date.now() - pageStartTime.current) / 1000);
        if (duration > 0 && duration < 3600) {
          supabase
            .from("visitor_logs")
            .update({ duration_seconds: duration })
            .eq("id", lastLogId.current)
            .then(() => {});
        }
      }

      pageStartTime.current = Date.now();
      lastPage.current = location.pathname;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return; // Only track authenticated users

      const { device_type, browser, os } = detectDevice();

      const { data } = await supabase
        .from("visitor_logs")
        .insert({
          session_id: getSessionId(),
          user_id: user.id,
          page: location.pathname,
          referrer: document.referrer || null,
          device_type,
          browser,
          os,
          screen_width: window.screen.width,
          screen_height: window.screen.height,
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
        .select("id")
        .single();

      if (data) lastLogId.current = data.id;
    };

    trackPageView();
  }, [location.pathname]);

  // Update duration on unmount / tab close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (lastLogId.current) {
        const duration = Math.round((Date.now() - pageStartTime.current) / 1000);
        if (duration > 0 && duration < 3600) {
          navigator.sendBeacon?.(
            `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/visitor_logs?id=eq.${lastLogId.current}`,
            // sendBeacon doesn't support PATCH easily, so we just skip final update on close
          );
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);
}
