import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import LogoUon1 from "@/assets/uon1-logo.png";
import { 
  Shield, 
  BarChart3, 
  Users, 
  FileText, 
  ChevronRight,
  CheckCircle,
  ArrowRight,
  Zap,
  Lock,
  TrendingUp,
  Sparkles
} from "lucide-react";

const Landing = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: Shield,
      title: "Gestão de Sinistros",
      description: "Controle completo do ciclo de vida dos sinistros, desde abertura até conclusão.",
      gradient: "from-[#362c89] to-[#5a4fcf]"
    },
    {
      icon: BarChart3,
      title: "BI & Indicadores",
      description: "Dashboards inteligentes com KPIs em tempo real para tomada de decisão.",
      gradient: "from-[#f97316] to-[#fbbf24]"
    },
    {
      icon: Users,
      title: "Portal do Parceiro",
      description: "Acesso exclusivo para parceiros acompanharem suas operações.",
      gradient: "from-[#5a4fcf] to-[#8b5cf6]"
    },
    {
      icon: FileText,
      title: "Vistorias Digitais",
      description: "Processo de vistoria 100% digital com análise automatizada por IA.",
      gradient: "from-[#ea580c] to-[#f97316]"
    }
  ];

  const benefits = [
    "Redução de até 60% no tempo de processamento",
    "Integração completa com sistemas externos",
    "Relatórios detalhados e exportáveis",
    "Suporte técnico especializado",
    "Atualizações contínuas sem custo adicional",
    "Conformidade com LGPD"
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src={LogoUon1} 
              alt="Uon1" 
              className="h-12 w-auto"
            />
          </div>
          <Button 
            onClick={() => navigate('/auth')}
            className="gap-2 bg-gradient-to-r from-[#362c89] to-[#5a4fcf] hover:from-[#362c89]/90 hover:to-[#5a4fcf]/90 text-white shadow-lg shadow-[#362c89]/30 transition-all duration-300 hover:shadow-xl hover:shadow-[#362c89]/40 hover:-translate-y-0.5 border-0"
          >
            Acessar Uon1
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-[#362c89]/30 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-20 right-1/4 w-[400px] h-[400px] bg-[#f97316]/20 rounded-full blur-[100px] animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-[#5a4fcf]/10 to-transparent rounded-full" />
          {/* Grid pattern */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDBoNjB2NjBIMHoiLz48cGF0aCBkPSJNMzAgMzBtLTEgMGExIDEgMCAxIDAgMiAwIDEgMSAwIDEgMCAwLTIgMCIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIvPjwvZz48L3N2Zz4=')] opacity-50" />
        </div>

        <div className="container mx-auto max-w-6xl relative">
          <div className="text-center space-y-8 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#362c89]/20 to-[#f97316]/20 border border-[#5a4fcf]/30 text-white text-sm font-medium backdrop-blur-sm">
              <Sparkles className="h-4 w-4 text-[#f97316]" />
              Plataforma completa de gestão
            </div>
            
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight">
              <span className="text-white">Gestão inteligente de</span>
              <br />
              <span className="bg-gradient-to-r from-[#5a4fcf] via-[#8b5cf6] to-[#f97316] bg-clip-text text-transparent">
                sinistros e operações
              </span>
            </h1>
            
            <p className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Transforme a gestão da sua associação com uma plataforma moderna, 
              segura e eficiente. Tudo que você precisa em um só lugar.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button 
                size="lg"
                onClick={() => navigate('/auth')}
                className="gap-2 text-lg px-8 py-6 bg-gradient-to-r from-[#362c89] to-[#5a4fcf] hover:from-[#362c89]/90 hover:to-[#5a4fcf]/90 shadow-xl shadow-[#362c89]/30 transition-all duration-300 hover:shadow-2xl hover:shadow-[#362c89]/40 hover:-translate-y-1 border-0"
              >
                Começar agora
                <ChevronRight className="h-5 w-5" />
              </Button>
              <Button 
                size="lg"
                variant="outline"
                className="gap-2 text-lg px-8 py-6 border-2 border-[#5a4fcf]/30 text-white hover:bg-[#5a4fcf]/10 hover:border-[#5a4fcf]/50 transition-all duration-300 bg-transparent"
              >
                Saiba mais
              </Button>
            </div>

            {/* Logo centralizada */}
            <div className="pt-12 flex justify-center">
              <img 
                src={LogoUon1} 
                alt="Uon1" 
                className="h-24 w-auto opacity-80 hover:opacity-100 transition-opacity duration-300"
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            {[
              { value: "500+", label: "Associações", color: "from-[#362c89] to-[#5a4fcf]" },
              { value: "50k+", label: "Sinistros gerenciados", color: "from-[#5a4fcf] to-[#8b5cf6]" },
              { value: "99.9%", label: "Uptime garantido", color: "from-[#f97316] to-[#fbbf24]" },
              { value: "24/7", label: "Suporte disponível", color: "from-[#ea580c] to-[#f97316]" }
            ].map((stat, index) => (
              <div 
                key={index}
                className="relative group text-center p-6 rounded-2xl bg-white/5 backdrop-blur border border-white/10 hover:border-[#5a4fcf]/50 transition-all duration-300 hover:-translate-y-1 overflow-hidden"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
                <div className={`text-3xl md:text-4xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>{stat.value}</div>
                <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#362c89]/5 to-transparent" />
        <div className="container mx-auto max-w-6xl relative">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">
              Recursos <span className="bg-gradient-to-r from-[#f97316] to-[#fbbf24] bg-clip-text text-transparent">poderosos</span>
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Ferramentas desenvolvidas para otimizar cada etapa da sua operação
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="group relative p-6 rounded-2xl bg-white/5 backdrop-blur border border-white/10 hover:border-[#5a4fcf]/50 transition-all duration-500 hover:-translate-y-2 overflow-hidden animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
                <div className={`relative w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-all duration-300 shadow-lg`}>
                  <feature.icon className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-white relative">{feature.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed relative">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="animate-fade-in">
              <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">
                Por que escolher a <span className="bg-gradient-to-r from-[#5a4fcf] to-[#f97316] bg-clip-text text-transparent">Uon1</span>?
              </h2>
              <p className="text-gray-400 text-lg mb-8">
                Nossa plataforma foi desenvolvida pensando nas necessidades reais 
                das associações de proteção veicular, oferecendo soluções que 
                realmente fazem diferença no dia a dia.
              </p>
              
              <div className="space-y-3">
                {benefits.map((benefit, index) => (
                  <div 
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors animate-fade-in group"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-[#362c89] to-[#5a4fcf] flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <CheckCircle className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-gray-300">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative animate-fade-in" style={{ animationDelay: '0.3s' }}>
              <div className="absolute inset-0 bg-gradient-to-r from-[#362c89]/30 to-[#f97316]/20 rounded-3xl blur-2xl" />
              <div className="relative grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="p-6 rounded-2xl bg-white/5 backdrop-blur border border-white/10 hover:border-[#5a4fcf]/50 transition-all duration-300 group">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-[#362c89] to-[#5a4fcf] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <Lock className="h-6 w-6 text-white" />
                    </div>
                    <h4 className="font-semibold mb-1 text-white">Segurança</h4>
                    <p className="text-sm text-gray-400">Dados protegidos com criptografia de ponta</p>
                  </div>
                  <div className="p-6 rounded-2xl bg-white/5 backdrop-blur border border-white/10 hover:border-[#f97316]/50 transition-all duration-300 group">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-[#f97316] to-[#fbbf24] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <TrendingUp className="h-6 w-6 text-white" />
                    </div>
                    <h4 className="font-semibold mb-1 text-white">Performance</h4>
                    <p className="text-sm text-gray-400">Sistema otimizado para alta velocidade</p>
                  </div>
                </div>
                <div className="space-y-4 pt-8">
                  <div className="p-6 rounded-2xl bg-gradient-to-br from-[#362c89] to-[#5a4fcf] text-white shadow-xl shadow-[#362c89]/30">
                    <div className="text-4xl font-bold mb-2">97%</div>
                    <p className="text-sm text-white/80">Taxa de satisfação dos clientes</p>
                  </div>
                  <div className="p-6 rounded-2xl bg-white/5 backdrop-blur border border-white/10 hover:border-[#f97316]/50 transition-all duration-300 group">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-[#ea580c] to-[#f97316] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <Zap className="h-6 w-6 text-white" />
                    </div>
                    <h4 className="font-semibold mb-1 text-white">Velocidade</h4>
                    <p className="text-sm text-gray-400">Respostas em milissegundos</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-t from-[#362c89]/10 to-transparent" />
        <div className="container mx-auto max-w-4xl text-center relative animate-fade-in">
          <div className="p-12 rounded-3xl bg-gradient-to-br from-[#362c89]/20 to-[#f97316]/10 backdrop-blur border border-white/10">
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">
              Pronto para transformar sua operação?
            </h2>
            <p className="text-gray-400 text-lg mb-8 max-w-2xl mx-auto">
              Junte-se a centenas de associações que já utilizam a Uon1 
              para gerenciar suas operações de forma eficiente.
            </p>
            <Button 
              size="lg"
              onClick={() => navigate('/auth')}
              className="gap-2 text-lg px-10 py-6 bg-gradient-to-r from-[#362c89] to-[#5a4fcf] hover:from-[#362c89]/90 hover:to-[#5a4fcf]/90 shadow-xl shadow-[#362c89]/30 transition-all duration-300 hover:shadow-2xl hover:shadow-[#362c89]/40 hover:-translate-y-1 border-0"
            >
              Acessar o sistema
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-white/5">
        <div className="container mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img 
              src={LogoUon1} 
              alt="Uon1" 
              className="h-8 w-auto opacity-70"
            />
            <span className="text-gray-500">
              © {new Date().getFullYear()} Uon1. Todos os direitos reservados.
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <a href="#" className="hover:text-[#f97316] transition-colors">Termos de Uso</a>
            <a href="#" className="hover:text-[#f97316] transition-colors">Privacidade</a>
            <a href="#" className="hover:text-[#f97316] transition-colors">Contato</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
