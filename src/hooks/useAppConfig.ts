import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface AppColors {
  primary: string;
  statusNovo: string;
  statusAndamento: string;
  statusAguardo: string;
  statusConcluido: string;
  priorityAlta: string;
  priorityMedia: string;
  priorityBaixa: string;
}

interface AppConfig {
  id?: string;
  user_id?: string;
  logo_url?: string;
  login_image_url?: string;
  colors: AppColors;
}

const defaultColors: AppColors = {
  primary: "#3b82f6",
  statusNovo: "#3b82f6",
  statusAndamento: "#f59e0b",
  statusAguardo: "#a855f7",
  statusConcluido: "#22c55e",
  priorityAlta: "#ef4444",
  priorityMedia: "#f59e0b",
  priorityBaixa: "#22c55e",
};

export function useAppConfig() {
  const { user } = useAuth();
  const [config, setConfig] = useState<AppConfig>({ colors: defaultColors });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadConfig();
    }
  }, [user]);

  const loadConfig = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('app_config')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading config:', error);
        return;
      }

      if (data) {
        setConfig({
          id: data.id,
          user_id: data.user_id,
          logo_url: data.logo_url || undefined,
          login_image_url: data.login_image_url || undefined,
          colors: { ...defaultColors, ...(data.colors as any) },
        });
        applyColors(data.colors as any);
      } else {
        applyColors(defaultColors);
      }
    } catch (error) {
      console.error('Error in loadConfig:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyColors = (colors: Partial<AppColors>) => {
    const root = document.documentElement;
    const colorMap = { ...defaultColors, ...colors };

    Object.entries(colorMap).forEach(([key, value]) => {
      const cssVarName = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      root.style.setProperty(`--${cssVarName}`, hexToHSL(value));
    });
  };

  const hexToHSL = (hex: string): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '0 0% 0%';

    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    h = Math.round(h * 360);
    s = Math.round(s * 100);
    l = Math.round(l * 100);

    return `${h} ${s}% ${l}%`;
  };

  const saveConfig = async (newConfig: Partial<AppConfig>) => {
    if (!user) return;

    try {
      const updateData: any = {
        user_id: user.id,
        logo_url: newConfig.logo_url !== undefined ? newConfig.logo_url : config.logo_url,
        login_image_url: newConfig.login_image_url !== undefined ? newConfig.login_image_url : config.login_image_url,
        colors: newConfig.colors || config.colors,
      };

      if (config.id) {
        const { error } = await supabase
          .from('app_config')
          .update(updateData)
          .eq('id', config.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('app_config')
          .insert([updateData])
          .select()
          .single();

        if (error) throw error;
        setConfig({ ...config, id: data.id });
      }

      if (newConfig.colors) {
        applyColors(newConfig.colors);
      }

      setConfig({ ...config, ...newConfig });
    } catch (error) {
      console.error('Error saving config:', error);
      throw error;
    }
  };

  return { config, loading, saveConfig, applyColors };
}
