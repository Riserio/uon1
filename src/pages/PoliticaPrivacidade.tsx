import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import LogoUon1 from "@/assets/uon1-logo.png";

const PoliticaPrivacidade = () => {
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
        <h1 className="text-3xl md:text-4xl font-bold text-[#1e1b4b] mb-8">Política de Privacidade</h1>
        <p className="text-sm text-[#5a4fcf]/60 mb-8">Última atualização: 28 de fevereiro de 2026</p>

        <div className="prose prose-lg max-w-none space-y-6 text-[#2d2473]">
          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">1. Introdução</h2>
            <p>A UON1 ("nós", "nosso" ou "empresa") está comprometida em proteger a privacidade dos usuários de nossa plataforma. Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e protegemos suas informações pessoais em conformidade com a Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018).</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">2. Dados Coletados</h2>
            <p>Podemos coletar os seguintes tipos de dados pessoais:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Dados de identificação:</strong> nome completo, CPF, CNPJ, RG e data de nascimento.</li>
              <li><strong>Dados de contato:</strong> endereço de e-mail, número de telefone e endereço postal.</li>
              <li><strong>Dados de acesso:</strong> endereço IP, tipo de navegador, sistema operacional e dados de log.</li>
              <li><strong>Dados financeiros:</strong> informações de pagamento e dados bancários quando aplicável.</li>
              <li><strong>Dados profissionais:</strong> cargo, empresa, informações contratuais e dados de associações.</li>
              <li><strong>Dados de veículos:</strong> placa, marca, modelo, ano e valor FIPE quando aplicável.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">3. Finalidade do Tratamento</h2>
            <p>Os dados pessoais são tratados para as seguintes finalidades:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Prestação dos serviços contratados na plataforma.</li>
              <li>Gestão de sinistros, vistorias e atendimentos.</li>
              <li>Comunicação com o usuário sobre atualizações, notificações e suporte.</li>
              <li>Cumprimento de obrigações legais e regulatórias.</li>
              <li>Melhoria contínua dos serviços e experiência do usuário.</li>
              <li>Geração de relatórios e indicadores de desempenho.</li>
              <li>Prevenção a fraudes e garantia da segurança da plataforma.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">4. Base Legal</h2>
            <p>O tratamento de dados pessoais é realizado com base nas seguintes hipóteses legais previstas na LGPD:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Execução de contrato ou diligências pré-contratuais (Art. 7º, V).</li>
              <li>Cumprimento de obrigação legal ou regulatória (Art. 7º, II).</li>
              <li>Legítimo interesse do controlador (Art. 7º, IX).</li>
              <li>Consentimento do titular, quando aplicável (Art. 7º, I).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">5. Compartilhamento de Dados</h2>
            <p>Seus dados podem ser compartilhados com:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Associações e administradoras parceiras vinculadas ao serviço.</li>
              <li>Prestadores de serviços essenciais (hospedagem, e-mail, comunicação).</li>
              <li>Autoridades governamentais, quando exigido por lei.</li>
            </ul>
            <p>Não comercializamos dados pessoais com terceiros.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">6. Armazenamento e Segurança</h2>
            <p>Os dados são armazenados em servidores seguros com criptografia em trânsito e em repouso. Adotamos medidas técnicas e administrativas aptas a proteger os dados contra acessos não autorizados, perda, destruição ou alteração. Os dados são retidos pelo período necessário ao cumprimento das finalidades descritas ou por exigência legal.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">7. Direitos do Titular</h2>
            <p>Conforme a LGPD, você tem os seguintes direitos:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Confirmação da existência de tratamento de dados.</li>
              <li>Acesso aos dados pessoais tratados.</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados.</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários.</li>
              <li>Portabilidade dos dados a outro fornecedor.</li>
              <li>Eliminação dos dados tratados com consentimento.</li>
              <li>Revogação do consentimento a qualquer momento.</li>
            </ul>
            <p>Para exercer seus direitos, entre em contato pelo e-mail: <strong>privacidade@uon1.com.br</strong></p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">8. Cookies</h2>
            <p>Utilizamos cookies e tecnologias semelhantes para melhorar a experiência de navegação, analisar o uso da plataforma e personalizar conteúdo. Você pode gerenciar suas preferências de cookies através das configurações do seu navegador.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">9. Alterações nesta Política</h2>
            <p>Reservamo-nos o direito de atualizar esta Política de Privacidade a qualquer momento. As alterações entrarão em vigor na data de sua publicação. Recomendamos que você revise periodicamente esta página.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#1e1b4b] mt-8 mb-3">10. Contato</h2>
            <p>Em caso de dúvidas sobre esta Política de Privacidade ou sobre o tratamento de seus dados pessoais, entre em contato conosco:</p>
            <p><strong>UON1</strong><br />E-mail: privacidade@uon1.com.br</p>
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

export default PoliticaPrivacidade;
