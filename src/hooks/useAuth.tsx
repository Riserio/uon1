import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: string | null;
  isParceiro: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any; isParceiro?: boolean; forcePasswordChange?: boolean }>;
  signUp: (email: string, password: string, nome: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isParceiro, setIsParceiro] = useState(false);
  const navigate = useNavigate();
  const roleLoadedRef = useRef(false);
  const initializedRef = useRef(false);

  const fetchUserRole = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();
      
      if (!error && data) {
        setUserRole(data.role);
        setIsParceiro(data.role === 'parceiro');
      } else {
        console.warn('[Auth] Failed to fetch user role:', error?.message);
        setUserRole(null);
        setIsParceiro(false);
      }
    } catch (err) {
      console.error('[Auth] Unexpected error fetching role:', err);
      setUserRole(null);
      setIsParceiro(false);
    }
    roleLoadedRef.current = true;
  }, []);

  useEffect(() => {
    let mounted = true;

    // Use onAuthStateChange as the SINGLE source of truth.
    // Supabase v2 emits INITIAL_SESSION synchronously during setup,
    // so we don't need a separate getSession() call that could race.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return;

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // Fetch role on initial load or sign-in
          if (!roleLoadedRef.current || event === 'SIGNED_IN') {
            await fetchUserRole(newSession.user.id);
          }
        } else {
          setUserRole(null);
          setIsParceiro(false);
          roleLoadedRef.current = false;
        }

        if (mounted) {
          setLoading(false);
          initializedRef.current = true;
        }
      }
    );

    // Safety net: if onAuthStateChange doesn't fire within 3s
    // (e.g. network issues), stop blocking the UI.
    const timeout = setTimeout(() => {
      if (mounted && !initializedRef.current) {
        console.warn('[Auth] Timeout waiting for session, unblocking UI');
        setLoading(false);
        initializedRef.current = true;
      }
    }, 3000);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [fetchUserRole]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) return { error };
    
    // Fetch profile and role in parallel to speed up login
    const userId = data.user.id;
    const [profileResult, roleResult] = await Promise.all([
      supabase.from('profiles').select('status, force_password_change').eq('id', userId).single(),
      supabase.from('user_roles').select('role').eq('user_id', userId).single(),
    ]);
    
    const profile = profileResult.data;
    const roleData = roleResult.data;
    
    if (profile?.status === 'pendente') {
      await supabase.auth.signOut();
      return { error: { message: 'Sua conta ainda não foi aprovada por um administrador.' } };
    }
    
    if (profile?.status === 'inativo') {
      await supabase.auth.signOut();
      return { error: { message: 'Sua conta está inativa.' } };
    }

    if (profile?.status === 'primeiro_login') {
      return { error: null, isParceiro: false, forcePasswordChange: true };
    }
    
    return { 
      error: null, 
      isParceiro: roleData?.role === 'parceiro',
      forcePasswordChange: profile?.force_password_change === true,
    };
  };

  const signUp = async (email: string, password: string, nome: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          nome,
        },
      },
    });
    
    if (error) {
      return { error };
    }
    
    if (data?.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: data.user.id,
          nome: nome,
          email: email,
          ativo: false,
          status: 'pendente'
        }, { onConflict: 'id' });
      
      if (profileError) {
        console.error('Error creating profile:', profileError);
      }
    }
    
    if (data?.session) {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
    }
    
    return { error };
  };

  const signOut = async () => {
    roleLoadedRef.current = false;
    await supabase.auth.signOut();
    navigate('/auth');
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, userRole, isParceiro, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
