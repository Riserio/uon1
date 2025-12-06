import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
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
  TrendingUp
} from "lucide-react";

const Landing = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: Shield,
      title: "Gestão de Sinistros",
      description: "Controle completo do ciclo de vida dos sinistros, desde abertura até conclusão."
    },
    {
      icon: BarChart3,
      title: "BI & Indicadores",
      description: "Dashboards inteligentes com KPIs em tempo real para tomada de decisão."
    },
    {
      icon: Users,
      title: "Portal do Parceiro",
      description: "Acesso exclusivo para parceiros acompanharem suas operações."
    },
    {
      icon: FileText,
      title: "Vistorias Digitais",
      description: "Processo de vistoria 100% digital com análise automatizada por IA."
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
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/images/logo-collapsed.png" 
              alt="Uon1" 
              className="h-10 w-auto"
            />
            <span className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Uon1
            </span>
          </div>
          <Button 
            onClick={() => navigate('/auth')}
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 transition-all duration-300 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5"
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
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-1/4 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-primary/5 to-transparent rounded-full" />
        </div>

        <div className="container mx-auto max-w-6xl relative">
          <div className="text-center space-y-8 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
              <Zap className="h-4 w-4" />
              Plataforma completa de gestão
            </div>
            
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight">
              <span className="text-foreground">Gestão inteligente de</span>
              <br />
              <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
                sinistros e operações
              </span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Transforme a gestão da sua associação com uma plataforma moderna, 
              segura e eficiente. Tudo que você precisa em um só lugar.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button 
                size="lg"
                onClick={() => navigate('/auth')}
                className="gap-2 text-lg px-8 py-6 bg-primary hover:bg-primary/90 shadow-xl shadow-primary/25 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/30 hover:-translate-y-1"
              >
                Começar agora
                <ChevronRight className="h-5 w-5" />
              </Button>
              <Button 
                size="lg"
                variant="outline"
                className="gap-2 text-lg px-8 py-6 border-2 hover:bg-accent transition-all duration-300"
              >
                Saiba mais
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-20 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            {[
              { value: "500+", label: "Associações" },
              { value: "50k+", label: "Sinistros gerenciados" },
              { value: "99.9%", label: "Uptime garantido" },
              { value: "24/7", label: "Suporte disponível" }
            ].map((stat, index) => (
              <div 
                key={index}
                className="text-center p-6 rounded-2xl bg-card/50 backdrop-blur border border-border/50 hover:border-primary/30 transition-all duration-300 hover:-translate-y-1"
              >
                <div className="text-3xl md:text-4xl font-bold text-primary">{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Recursos <span className="text-primary">poderosos</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Ferramentas desenvolvidas para otimizar cada etapa da sua operação
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="group p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 transition-all duration-500 hover:-translate-y-2 animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <feature.icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
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
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Por que escolher a <span className="text-primary">Uon1</span>?
              </h2>
              <p className="text-muted-foreground text-lg mb-8">
                Nossa plataforma foi desenvolvida pensando nas necessidades reais 
                das associações de proteção veicular, oferecendo soluções que 
                realmente fazem diferença no dia a dia.
              </p>
              
              <div className="space-y-4">
                {benefits.map((benefit, index) => (
                  <div 
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors animate-fade-in"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                    <span className="text-foreground">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative animate-fade-in" style={{ animationDelay: '0.3s' }}>
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/5 rounded-3xl blur-2xl" />
              <div className="relative grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/30 transition-all duration-300">
                    <Lock className="h-8 w-8 text-primary mb-3" />
                    <h4 className="font-semibold mb-1">Segurança</h4>
                    <p className="text-sm text-muted-foreground">Dados protegidos com criptografia de ponta</p>
                  </div>
                  <div className="p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/30 transition-all duration-300">
                    <TrendingUp className="h-8 w-8 text-primary mb-3" />
                    <h4 className="font-semibold mb-1">Performance</h4>
                    <p className="text-sm text-muted-foreground">Sistema otimizado para alta velocidade</p>
                  </div>
                </div>
                <div className="space-y-4 pt-8">
                  <div className="p-6 rounded-2xl bg-primary text-primary-foreground">
                    <div className="text-4xl font-bold mb-2">97%</div>
                    <p className="text-sm opacity-90">Taxa de satisfação dos clientes</p>
                  </div>
                  <div className="p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/30 transition-all duration-300">
                    <Zap className="h-8 w-8 text-primary mb-3" />
                    <h4 className="font-semibold mb-1">Velocidade</h4>
                    <p className="text-sm text-muted-foreground">Respostas em milissegundos</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-gradient-to-b from-muted/30 to-background">
        <div className="container mx-auto max-w-4xl text-center animate-fade-in">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Pronto para transformar sua operação?
          </h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
            Junte-se a centenas de associações que já utilizam a Uon1 
            para gerenciar suas operações de forma eficiente.
          </p>
          <Button 
            size="lg"
            onClick={() => navigate('/auth')}
            className="gap-2 text-lg px-10 py-6 bg-primary hover:bg-primary/90 shadow-xl shadow-primary/25 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/30 hover:-translate-y-1"
          >
            Acessar o sistema
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border/50">
        <div className="container mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img 
              src="/images/logo-collapsed.png" 
              alt="Uon1" 
              className="h-8 w-auto opacity-70"
            />
            <span className="text-muted-foreground">
              © {new Date().getFullYear()} Uon1. Todos os direitos reservados.
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-primary transition-colors">Termos de Uso</a>
            <a href="#" className="hover:text-primary transition-colors">Privacidade</a>
            <a href="#" className="hover:text-primary transition-colors">Contato</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
