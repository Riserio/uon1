import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import LogoUon1 from "@/assets/uon1-logo.png";

const TermosServico = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f5f3ff] via-[#ede9fe] to-[#e0e7ff]">
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-[#5a4fcf]/10">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
            <img src={LogoUon1} alt="Uon1" className="h-10 w-auto" />
          </div>
          <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2 text-[#362c89]">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl md:text-4xl font-bold text-[#1e1b4b] mb-8">Termos de Serviço</h1>
        <p className="text-sm text-[#5a4fcf]/60 mb-8">Última atualização: 28 de fevereiro de 2026</p>

        <div className="prose prose-lg max-w-none space-y-6 text-[#2d2473]">
          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">1. Aceitação dos Termos</h2>
            <p>Ao acessar e utilizar a plataforma UON1 ("Plataforma"), você concorda com estes Termos de Serviço. Caso não concorde com algum dos termos aqui estabelecidos, não utilize a Plataforma.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">2. Descrição do Serviço</h2>
            <p>A UON1 é uma plataforma de gestão voltada para administradoras e associações de proteção veicular, oferecendo funcionalidades como:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Gestão de sinistros e atendimentos.</li>
              <li>Vistorias digitais com análise por inteligência artificial.</li>
              <li>Assinatura digital de contratos (UON1SIGN).</li>
              <li>Dashboards e indicadores de desempenho (BI).</li>
              <li>Portal do parceiro para associações.</li>
              <li>Gestão financeira, cobrança e controle de jornada.</li>
              <li>Comunicação integrada via e-mail e WhatsApp.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">3. Cadastro e Conta</h2>
            <p>Para utilizar a Plataforma, é necessário criar uma conta com informações verdadeiras e atualizadas. Você é responsável por manter a confidencialidade de suas credenciais de acesso e por todas as atividades realizadas em sua conta. Notifique-nos imediatamente caso suspeite de uso não autorizado.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">4. Uso Aceitável</h2>
            <p>Ao utilizar a Plataforma, você concorda em:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Não utilizar o serviço para fins ilegais ou não autorizados.</li>
              <li>Não tentar acessar áreas restritas do sistema sem autorização.</li>
              <li>Não transmitir vírus, malware ou qualquer código malicioso.</li>
              <li>Não realizar engenharia reversa ou descompilar o software.</li>
              <li>Não compartilhar suas credenciais de acesso com terceiros.</li>
              <li>Utilizar a Plataforma de acordo com a legislação brasileira vigente.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">5. Propriedade Intelectual</h2>
            <p>Todo o conteúdo da Plataforma, incluindo mas não se limitando a textos, gráficos, logotipos, ícones, imagens, software e código-fonte, é de propriedade exclusiva da UON1 ou de seus licenciadores e está protegido pelas leis de propriedade intelectual brasileiras e internacionais.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">6. Disponibilidade do Serviço</h2>
            <p>A UON1 se esforça para manter a Plataforma disponível 24 horas por dia, 7 dias por semana. No entanto, não garantimos disponibilidade ininterrupta, podendo ocorrer interrupções para manutenção programada, atualizações ou por motivos de força maior. Não seremos responsáveis por eventuais indisponibilidades temporárias.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">7. Responsabilidades do Usuário</h2>
            <p>O usuário é responsável por:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Manter seus dados cadastrais atualizados.</li>
              <li>Garantir a veracidade das informações fornecidas.</li>
              <li>Utilizar a Plataforma de forma ética e em conformidade com a lei.</li>
              <li>Manter backup de seus dados quando necessário.</li>
              <li>Reportar qualquer vulnerabilidade ou falha de segurança identificada.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">8. Limitação de Responsabilidade</h2>
            <p>A UON1 não será responsável por danos indiretos, incidentais, especiais ou consequenciais decorrentes do uso ou impossibilidade de uso da Plataforma. Nossa responsabilidade total estará limitada ao valor pago pelo usuário nos últimos 12 meses de contratação do serviço.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">9. Rescisão</h2>
            <p>Qualquer uma das partes pode rescindir o uso do serviço a qualquer momento. A UON1 reserva-se o direito de suspender ou encerrar contas que violem estes Termos de Serviço, sem aviso prévio. Em caso de rescisão, os dados do usuário serão mantidos pelo período exigido por lei.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">10. Alterações nos Termos</h2>
            <p>A UON1 pode modificar estes Termos de Serviço a qualquer momento. As alterações entrarão em vigor imediatamente após a publicação na Plataforma. O uso continuado após as alterações constitui aceitação dos novos termos.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">11. Legislação Aplicável</h2>
            <p>Estes Termos de Serviço são regidos pela legislação brasileira. Fica eleito o foro da comarca da sede da UON1 para dirimir quaisquer controvérsias decorrentes destes Termos, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">12. Contato</h2>
            <p>Em caso de dúvidas sobre estes Termos de Serviço, entre em contato:</p>
            <p><strong>UON1</strong><br />E-mail: contato@uon1.com.br</p>
          </section>
        </div>
      </main>

      <footer className="py-8 px-6 border-t border-[#5a4fcf]/10 bg-white/50 backdrop-blur-sm">
        <div className="container mx-auto max-w-6xl flex items-center justify-center">
          <span className="text-[#5a4fcf]/60 text-sm">© {new Date().getFullYear()} Uon1. Todos os direitos reservados.</span>
        </div>
      </footer>
    </div>
  );
};

export default TermosServico;
