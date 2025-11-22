import { useEffect } from "react";
import { useForm } from "react-hook-form";

type FormData = {
  nome: string;
  nome_condutor: string;
  cpf: string;
  cpf_condutor: string;
  placa: string;
  marca: string;
  modelo: string;
  // ... outros campos do seu form
};

export default function VistoriaPublicaFormulario() {
  const { register, handleSubmit, setValue } = useForm<FormData>({
    defaultValues: {
      nome: "",
      nome_condutor: "",
      cpf: "",
      cpf_condutor: "",
      placa: "",
      marca: "",
      modelo: "",
    },
  });

  useEffect(() => {
    try {
      const tempRaw = localStorage.getItem("vistoria_temp");
      if (!tempRaw) return;

      const temp = JSON.parse(tempRaw) as {
        cnhData?: any;
        vehicleData?: any;
      };

      const cnh = temp.cnhData || {};
      const veiculo = temp.vehicleData || {};

      // 🔹 NOME / NOME DO CONDUTOR
      const nomeFromCnh = cnh.nome || cnh.nome_condutor || cnh.nome_condutor_principal || cnh.nome_completo;

      if (nomeFromCnh) {
        // nome geral
        setValue("nome", nomeFromCnh);
        // nome do condutor
        setValue("nome_condutor", nomeFromCnh);
      }

      // 🔹 CPF / CPF DO CONDUTOR
      const cpfFromCnh = cnh.cpf || cnh.cpf_condutor || cnh.cpf_numero;
      if (cpfFromCnh) {
        setValue("cpf", cpfFromCnh);
        setValue("cpf_condutor", cpfFromCnh);
      }

      // 🔹 DADOS DO VEÍCULO (CRLV + frontal)
      const placaFromOcr = veiculo.placa || veiculo.placa_veiculo;
      const marcaFromOcr = veiculo.marca || veiculo.marca_veiculo;
      const modeloFromOcr = veiculo.modelo || veiculo.modelo_veiculo;

      if (placaFromOcr) setValue("placa", placaFromOcr);
      if (marcaFromOcr) setValue("marca", marcaFromOcr);
      if (modeloFromOcr) setValue("modelo", modeloFromOcr);
    } catch (err) {
      console.error("Erro ao aplicar dados de OCR no formulário:", err);
    }
  }, [setValue]);

  const onSubmit = (data: FormData) => {
    // ... seu submit
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("nome")} placeholder="Nome do segurado" />
      <input {...register("nome_condutor")} placeholder="Nome do condutor" />
      <input {...register("cpf")} placeholder="CPF" />
      <input {...register("cpf_condutor")} placeholder="CPF do condutor" />
      <input {...register("placa")} placeholder="Placa" />
      <input {...register("marca")} placeholder="Marca" />
      <input {...register("modelo")} placeholder="Modelo" />
      {/* ... resto do formulário */}
      <button type="submit">Enviar</button>
    </form>
  );
}
