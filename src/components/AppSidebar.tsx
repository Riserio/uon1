import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  UserCircle, 
  UsersRound, 
  Calendar, 
  LogOut, 
  Megaphone, 
  Settings, 
  FileText, 
  Mail, 
  ClipboardList, 
  Send 
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { usePendingUsers } from '@/hooks/usePendingUsers';
import { useAppConfig } from '@/hooks/useAppConfig';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
  SidebarSeparator,
  SidebarFooter,
  SidebarHeader,
} from '@/components/ui/sidebar';

export function AppSidebar() {
  const { signOut, userRole } = useAuth();
  const { state, toggleSidebar } = useSidebar();
  const { config } = useAppConfig();
  const unreadMessages = useUnreadMessages();
  const pendingUsers = usePendingUsers();
  
  const collapsed = state === 'collapsed';

  return (
    <>
      <Sidebar collapsible="icon" className={collapsed ? "border-r sticky top-0 h-screen z-[60]" : "border-r sticky top-0 h-screen z-[60] w-56"}>
        <SidebarHeader className="border-b p-4">
          <div className="flex items-center justify-center">
            {collapsed ? (
              <img 
                src="/images/logo-collapsed.jpg" 
                alt="Logo" 
                className="h-8 w-8 object-contain rounded"
              />
            ) : (
              config.logo_url ? (
                <img 
                  src={config.logo_url} 
                  alt="Logo" 
                  className="h-10 w-auto max-w-[150px] object-contain"
                />
              ) : (
                <span className="font-semibold text-lg">Menu</span>
              )
            )}
          </div>
        </SidebarHeader>
        
        {/* Custom Toggle Button - Half outside sidebar, anchored to top */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-4 z-[70] h-7 w-7 rounded-full bg-sidebar-accent border border-border flex items-center justify-center hover:bg-sidebar-accent/80 transition-colors shadow-md"
          aria-label="Alternar sidebar"
        >
          {collapsed ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-sidebar-foreground">
              <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-sidebar-foreground">
              <path d="M8 2L4 6L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navegação</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/" end activeClassName="bg-primary text-primary-foreground">
                      <LayoutDashboard className="h-4 w-4" />
                      {!collapsed && <span>Painel</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/atendimentos" activeClassName="bg-primary text-primary-foreground">
                      <ClipboardList className="h-4 w-4" />
                      {!collapsed && <span>Atendimentos</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel>Cadastros</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/corretoras" activeClassName="bg-primary text-primary-foreground">
                      <Building2 className="h-4 w-4" />
                      {!collapsed && <span>Corretoras</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/contatos" activeClassName="bg-primary text-primary-foreground">
                      <Users className="h-4 w-4" />
                      {!collapsed && <span>Contatos</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {(userRole === 'admin' || userRole === 'administrativo' || userRole === 'superintendente') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/usuarios" activeClassName="bg-primary text-primary-foreground">
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <UserCircle className="h-4 w-4" />
                            {!collapsed && <span>Usuários</span>}
                          </div>
                          {!collapsed && pendingUsers > 0 && (
                            <Badge variant="destructive" className="ml-auto">
                              {pendingUsers}
                            </Badge>
                          )}
                        </div>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {/* Equipes removido - agora está em Usuários */}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel>Ferramentas</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/agenda" activeClassName="bg-primary text-primary-foreground">
                      <Calendar className="h-4 w-4" />
                      {!collapsed && <span>Agenda</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/documentos" activeClassName="bg-primary text-primary-foreground">
                      <FileText className="h-4 w-4" />
                      {!collapsed && <span>Documentos</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/mensagens" activeClassName="bg-primary text-primary-foreground">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          {!collapsed && <span>Mensagens</span>}
                        </div>
                        {!collapsed && unreadMessages > 0 && (
                          <Badge variant="destructive" className="ml-auto">
                            {unreadMessages}
                          </Badge>
                        )}
                      </div>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/emails" activeClassName="bg-primary text-primary-foreground">
                      <Send className="h-4 w-4" />
                      {!collapsed && <span>E-mails</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {(userRole === 'admin' || userRole === 'superintendente') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/comunicados" activeClassName="bg-primary text-primary-foreground">
                      <Megaphone className="h-4 w-4" />
                        {!collapsed && <span>Comunicados</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {(userRole === 'admin' || userRole === 'superintendente') && (
            <SidebarMenuItem>
              <Link to="/configuracoes">
                <SidebarMenuButton>
                  <Settings className="h-4 w-4" />
                  {!collapsed && <span>Configurações</span>}
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={signOut} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                <LogOut className="h-4 w-4" />
                {!collapsed && <span>Sair</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
    </>
  );
}
