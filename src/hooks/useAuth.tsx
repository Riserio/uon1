import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: string | null;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, nome: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Check user status before allowing access
          setTimeout(async () => {
            const { data: profile } = await supabase
              .from('profiles')
              .select('status')
              .eq('id', session.user.id)
              .single();
            
            // If pending or inactive, sign out immediately
            if (profile?.status === 'pendente' || profile?.status === 'inativo') {
              await supabase.auth.signOut();
              setUser(null);
              setSession(null);
              setUserRole(null);
              setLoading(false);
              return;
            }
            
            // If approved, fetch user role
            fetchUserRole(session.user.id);
          }, 0);
        } else {
          setUserRole(null);
        }
        
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserRole(session.user.id);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();
    
    if (!error && data) {
      setUserRole(data.role);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) return { error };
    
    // Check if user is approved
    const { data: profile } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', data.user?.id)
      .single();
    
    if (profile?.status === 'pendente') {
      await supabase.auth.signOut();
      return { error: { message: 'Sua conta ainda não foi aprovada por um administrador.' } };
    }
    
    if (profile?.status === 'inativo') {
      await supabase.auth.signOut();
      return { error: { message: 'Sua conta está inativa.' } };
    }

    // Check if user needs to change password (first login - if created by admin with temp password)
    if (profile?.status === 'primeiro_login') {
      navigate('/change-password');
      return { error: null };
    }
    
    // Check if user is a parceiro (partner)
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', data.user.id)
      .single();
    
    // Redirect parceiros to portal, others to main dashboard
    if (roleData?.role === 'parceiro') {
      navigate('/portal');
    } else {
      navigate('/');
    }
    
    return { error: null };
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
    
    // If there was an automatic login, sign out immediately
    // User must wait for admin approval
    if (data?.session) {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
    }
    
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, userRole, signIn, signUp, signOut }}>
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
