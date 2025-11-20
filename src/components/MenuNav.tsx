import { Button } from '@/components/ui/button';
import { Home, LayoutDashboard, Building2, Users, UserCircle, UsersRound, Calendar, LogOut, Megaphone, Settings, FileText, Mail, ClipboardList, Camera, FileX } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { usePendingUsers } from '@/hooks/usePendingUsers';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function MenuNav() {
  const location = useLocation();
  const { signOut, userRole } = useAuth();
  const unreadMessages = useUnreadMessages();
  const pendingUsers = usePendingUsers();

  const isActive = (path: string) => location.pathname === path;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Navegação</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/" className="cursor-pointer">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>Painel</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/atendimentos" className="cursor-pointer">
              <ClipboardList className="mr-2 h-4 w-4" />
              <span>Atendimentos</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Cadastros</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link to="/corretoras" className="cursor-pointer">
              <Building2 className="mr-2 h-4 w-4" />
              <span>Corretoras</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/contatos" className="cursor-pointer">
              <Users className="mr-2 h-4 w-4" />
              <span>Contatos</span>
            </Link>
          </DropdownMenuItem>
          {(userRole === 'admin' || userRole === 'administrativo' || userRole === 'superintendente') && (
            <DropdownMenuItem asChild>
              <Link to="/usuarios" className="cursor-pointer flex items-center justify-between w-full">
                <div className="flex items-center">
                  <UserCircle className="mr-2 h-4 w-4" />
                  <span>Usuários</span>
                </div>
                {pendingUsers > 0 && (
                  <Badge variant="destructive" className="ml-auto">
                    {pendingUsers}
                  </Badge>
                )}
              </Link>
            </DropdownMenuItem>
          )}
          {/* Equipes removido - agora está em Usuários */}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Ferramentas</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link to="/sinistros/novo" className="cursor-pointer">
              <FileX className="mr-2 h-4 w-4" />
              <span>Abertura de Sinistro</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/sinistros/acompanhamento" className="cursor-pointer">
              <ClipboardList className="mr-2 h-4 w-4" />
              <span>Acompanhamento de Sinistros</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/vistorias" className="cursor-pointer">
              <Camera className="mr-2 h-4 w-4" />
              <span>Vistorias</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/agenda" className="cursor-pointer">
              <Calendar className="mr-2 h-4 w-4" />
              <span>Agenda</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/documentos" className="cursor-pointer">
              <FileText className="mr-2 h-4 w-4" />
              <span>Documentos</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/mensagens" className="cursor-pointer flex items-center justify-between w-full">
              <div className="flex items-center">
                <Mail className="mr-2 h-4 w-4" />
                <span>Mensagens</span>
              </div>
              {unreadMessages > 0 && (
                <Badge variant="destructive" className="ml-auto">
                  {unreadMessages}
                </Badge>
              )}
            </Link>
          </DropdownMenuItem>
          {(userRole === 'admin' || userRole === 'superintendente') && (
            <DropdownMenuItem asChild>
              <Link to="/emails" className="cursor-pointer">
                <Mail className="mr-2 h-4 w-4" />
                <span>E-mails</span>
              </Link>
            </DropdownMenuItem>
          )}
          {(userRole === 'admin' || userRole === 'superintendente') && (
            <DropdownMenuItem asChild>
              <Link to="/comunicados" className="cursor-pointer">
                <Megaphone className="mr-2 h-4 w-4" />
                <span>Comunicados</span>
              </Link>
            </DropdownMenuItem>
          )}
          {(userRole === 'admin' || userRole === 'superintendente') && (
            <DropdownMenuItem asChild>
              <Link to="/configuracoes" className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                <span>Configurações</span>
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sair</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
}
