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
  Sparkles,
  PenTool,
  Clock,
} from "lucide-react";

const Landing = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: Shield,
      title: "Gestão de Sinistros",
      description: "Controle completo do ciclo de vida dos sinistros, desde abertura até conclusão.",
      gradient: "from-[#362c89] to-[#5a4fcf]",
    },
    {
      icon: PenTool,
      title: "UON1SIGN",
      description: "Assinatura digital de contratos com validade jurídica e rastreabilidade completa.",
      gradient: "from-[#059669] to-[#34d399]",
    },
    {
      icon: Clock,
      title: "Controle de Jornada",
      description: "Gestão completa de ponto, banco de horas e relatórios de funcionários.",
      gradient: "from-[#ea580c] to-[#fb923c]",
    },
    {
      icon: BarChart3,
      title: "BI & Indicadores",
      description: "Dashboards inteligentes com KPIs em tempo real para tomada de decisão.",
      gradient: "from-[#7c3aed] to-[#a78bfa]",
    },
    {
      icon: Users,
      title: "Portal do Parceiro",
      description: "Acesso exclusivo para parceiros acompanharem suas operações.",
      gradient: "from-[#5a4fcf] to-[#8b5cf6]",
    },
    {
      icon: FileText,
      title: "Vistorias Digitais",
      description: "Processo de vistoria 100% digital com análise automatizada por IA.",
      gradient: "from-[#8b5cf6] to-[#c4b5fd]",
    },
  ];

  const benefits = [
    "Redução de até 60% no tempo de processamento",
    "Integração completa com sistemas externos",
    "Relatórios detalhados e exportáveis",
    "Suporte técnico especializado",
    "Atualizações contínuas sem custo adicional",
    "Conformidade com LGPD",
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f5f3ff] via-[#ede9fe] to-[#e0e7ff] overflow-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-xl border-b border-[#5a4fcf]/10">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={LogoUon1} alt="Uon1" className="h-12 w-auto" />
          </div>
          <Button
            onClick={() => navigate("/auth")}
            className="gap-2 bg-gradient-to-r from-[#362c89] to-[#5a4fcf] hover:from-[#2d2473] hover:to-[#4a3fbf] text-white shadow-lg shadow-[#362c89]/30 transition-all duration-300 hover:shadow-xl hover:shadow-[#362c89]/40 hover:-translate-y-0.5 border-0"
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
          <div className="absolute top-10 left-1/4 w-[600px] h-[600px] bg-[#7c3aed]/20 rounded-full blur-[150px]" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-[#362c89]/25 rounded-full blur-[120px]" />
          <div className="absolute top-1/3 right-10 w-[300px] h-[300px] bg-[#a78bfa]/30 rounded-full blur-[80px]" />
          <div className="absolute bottom-1/4 left-10 w-[250px] h-[250px] bg-[#8b5cf6]/25 rounded-full blur-[60px]" />
        </div>

        <div className="container mx-auto max-w-6xl relative">
          <div className="text-center space-y-8 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 border border-[#5a4fcf]/20 text-[#362c89] text-sm font-medium shadow-sm backdrop-blur-sm">
              <Sparkles className="h-4 w-4 text-[#7c3aed]" />
              Plataforma para administradoras e associações
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight">
              <span className="text-[#1e1b4b]">Gestão inteligente de</span>
              <br />
              <span className="bg-gradient-to-r from-[#362c89] via-[#5a4fcf] to-[#7c3aed] bg-clip-text text-transparent">
                sinistros e operações
              </span>
            </h1>

            <p className="text-xl text-[#4c4587] max-w-2xl mx-auto leading-relaxed">
              Transforme a gestão da sua administradora e associação com uma plataforma moderna, segura e eficiente.
              Tudo que você precisa em um só lugar.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button
                size="lg"
                onClick={() => navigate("/auth")}
                className="gap-2 text-lg px-8 py-6 bg-gradient-to-r from-[#362c89] to-[#5a4fcf] hover:from-[#2d2473] hover:to-[#4a3fbf] shadow-xl shadow-[#362c89]/30 transition-all duration-300 hover:shadow-2xl hover:shadow-[#362c89]/40 hover:-translate-y-1 border-0 text-white"
              >
                Começar agora
                <ChevronRight className="h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="gap-2 text-lg px-8 py-6 border-2 border-[#5a4fcf]/40 text-[#362c89] hover:bg-[#5a4fcf]/10 hover:border-[#5a4fcf] transition-all duration-300 bg-white/50 backdrop-blur-sm"
              >
                Saiba mais
              </Button>
            </div>

            {/* Logo centralizada */}
            <div className="pt-12 flex justify-center">
              <img
                src={LogoUon1}
                alt="Uon1"
                className="h-24 w-auto opacity-90 hover:opacity-100 transition-opacity duration-300 drop-shadow-lg"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#5a4fcf]/5 to-transparent" />
        <div className="container mx-auto max-w-6xl relative">
          <div className="text-center mb-16 animate-fade-in">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-[#1e1b4b]">
              Recursos{" "}
              <span className="bg-gradient-to-r from-[#5a4fcf] to-[#7c3aed] bg-clip-text text-transparent">
                poderosos
              </span>
            </h2>
            <p className="text-[#4c4587] text-lg max-w-2xl mx-auto">
              Ferramentas desenvolvidas para otimizar cada etapa da sua operação
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group relative p-6 rounded-2xl bg-white/80 backdrop-blur-sm border border-[#5a4fcf]/10 hover:border-[#5a4fcf]/30 shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-2 overflow-hidden animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}
                />
                <div
                  className={`relative w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-all duration-300 shadow-lg shadow-[#362c89]/20`}
                >
                  <feature.icon className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-[#1e1b4b] relative">{feature.title}</h3>
                <p className="text-[#5a4fcf]/70 text-sm leading-relaxed relative">{feature.description}</p>
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
              <h2 className="text-3xl md:text-4xl font-bold mb-6 text-[#1e1b4b]">
                Por que escolher a{" "}
                <span className="bg-gradient-to-r from-[#362c89] to-[#7c3aed] bg-clip-text text-transparent">Uon1</span>
                ?
              </h2>
              <p className="text-[#4c4587] text-lg mb-8">
                Nossa plataforma foi desenvolvida pensando nas necessidades reais das administradoras e associações de
                proteção veicular, oferecendo soluções que realmente fazem diferença no dia a dia.
              </p>

              <div className="space-y-3">
                {benefits.map((benefit, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/60 transition-colors animate-fade-in group"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-[#362c89] to-[#5a4fcf] flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-sm">
                      <CheckCircle className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-[#2d2473] font-medium">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative animate-fade-in" style={{ animationDelay: "0.3s" }}>
              <div className="absolute inset-0 bg-gradient-to-r from-[#362c89]/20 to-[#7c3aed]/20 rounded-3xl blur-2xl" />
              <div className="relative grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="p-6 rounded-2xl bg-white/80 backdrop-blur-sm border border-[#5a4fcf]/10 hover:border-[#5a4fcf]/30 shadow-sm hover:shadow-lg transition-all duration-300 group">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-[#362c89] to-[#5a4fcf] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-md">
                      <Lock className="h-6 w-6 text-white" />
                    </div>
                    <h4 className="font-semibold mb-1 text-[#1e1b4b]">Segurança</h4>
                    <p className="text-sm text-[#5a4fcf]/70">Dados protegidos com criptografia de ponta</p>
                  </div>
                  <div className="p-6 rounded-2xl bg-white/80 backdrop-blur-sm border border-[#5a4fcf]/10 hover:border-[#7c3aed]/30 shadow-sm hover:shadow-lg transition-all duration-300 group">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-[#5a4fcf] to-[#7c3aed] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-md">
                      <TrendingUp className="h-6 w-6 text-white" />
                    </div>
                    <h4 className="font-semibold mb-1 text-[#1e1b4b]">Performance</h4>
                    <p className="text-sm text-[#5a4fcf]/70">Sistema otimizado para alta velocidade</p>
                  </div>
                </div>
                <div className="space-y-4 pt-8">
                  <div className="p-6 rounded-2xl bg-gradient-to-br from-[#362c89] to-[#5a4fcf] text-white shadow-xl shadow-[#362c89]/30">
                    <div className="text-4xl font-bold mb-2">97%</div>
                    <p className="text-sm text-white/80">Taxa de satisfação dos clientes</p>
                  </div>
                  <div className="p-6 rounded-2xl bg-white/80 backdrop-blur-sm border border-[#5a4fcf]/10 hover:border-[#8b5cf6]/30 shadow-sm hover:shadow-lg transition-all duration-300 group">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#8b5cf6] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-md">
                      <Zap className="h-6 w-6 text-white" />
                    </div>
                    <h4 className="font-semibold mb-1 text-[#1e1b4b]">Velocidade</h4>
                    <p className="text-sm text-[#5a4fcf]/70">Respostas em milissegundos</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-t from-[#362c89]/5 to-transparent" />
        <div className="container mx-auto max-w-4xl text-center relative animate-fade-in">
          <div className="p-12 rounded-3xl bg-gradient-to-br from-[#362c89] via-[#5a4fcf] to-[#7c3aed] shadow-2xl shadow-[#362c89]/30">
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">Pronto para transformar sua operação?</h2>
            <p className="text-white/80 text-lg mb-8 max-w-2xl mx-auto">
              Junte-se a centenas de associações que já utilizam a Uon1 para gerenciar suas operações de forma
              eficiente.
            </p>
            <Button
              size="lg"
              onClick={() => navigate("/auth")}
              className="gap-2 text-lg px-10 py-6 bg-white text-[#362c89] hover:bg-white/90 shadow-xl transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 border-0 font-semibold"
            >
              Acessar o sistema
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-[#5a4fcf]/10 bg-white/50 backdrop-blur-sm">
        <div className="container mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={LogoUon1} alt="Uon1" className="h-8 w-auto opacity-80" />
            <span className="text-[#5a4fcf]/60">© {new Date().getFullYear()} Uon1. Todos os direitos reservados.</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-[#5a4fcf]/60">
            <a href="/termos-de-servico" className="hover:text-[#362c89] transition-colors">
              Termos de Uso
            </a>
            <a href="/politica-de-privacidade" className="hover:text-[#362c89] transition-colors">
              Privacidade
            </a>
            <a href="mailto:contato@uon1.com.br" className="hover:text-[#362c89] transition-colors">
              Contato
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
