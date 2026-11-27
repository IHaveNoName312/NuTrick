# NuTrick

Aplicativo PWA pessoal para registro alimentar e acompanhamento nutricional.

## Publicar pelo GitHub Pages

1. Abra **Settings → Pages** neste repositório.
2. Em **Build and deployment**, selecione **Deploy from a branch**.
3. Escolha a branch **main** e a pasta **/(root)** e clique em **Save**.
4. Aguarde a publicação. O endereço esperado é https://ihavenoname312.github.io/NuTrick/.
5. No iPhone, abra o endereço pelo Safari, toque em **Compartilhar → Adicionar à Tela de Início**.

## O que esta versão inclui

- Painel de calorias e macronutrientes.
- Metas editáveis e registro de água.
- Diário alimentar com histórico local organizado por dia, subtotais diários de calorias e proteínas e contagem de refeições/dias registrados.
- Histórico de medidas ordenado pela data do registro, inclusive após importar backups fora de ordem.
- Identificadores de novas refeições protegidos contra colisões no mesmo milissegundo e exclusão compatível com identificadores numéricos de backups antigos.
- Edição de refeições preserva a fotografia nutricional do momento do registro: alterar quantidade ou porção ajusta proporcionalmente os valores salvos, sem recalcular registros antigos pela composição atual do catálogo.
- Alimentos de registros históricos são associados ao catálogo apenas por identificador exato, evitando vincular por engano produtos diferentes com nomes iguais.
- Itens novos adicionados durante a edição usam a referência nutricional atual; itens antigos continuam preservando sua composição original.
- Cadastro manual e pesquisa de alimentos.
- Registro por texto e botão **Analisar macros**.
- Perguntas de esclarecimento e confirmação antes de salvar estimativas.
- Sugestões simples de refeições recorrentes.
- Registro de peso e cintura.
- Exportação de backup JSON versionado e importação com validação estrutural antes de substituir os dados.
- Validação do estado completo antes de exportar um backup, evitando gerar arquivos que o próprio aplicativo não conseguiria restaurar.
- Importação e restauração protegidas contra abas desatualizadas: se outra aba já gravou dados novos, a operação é bloqueada em vez de sobrescrever o estado mais recente.
- Ponto de restauração transacional com cópia alternativa: falhas ao gravar o estado principal ou finalizar o ponto de restauração não descartam a cópia anterior.
- Testes de ida e volta com refeições, água, medidas e snapshots nutricionais de vários dias, inclusive itens históricos cujo alimento não existe mais no catálogo atual.
- Primeira gravação validada em instalações novas, mesmo quando ainda não existe uma chave de armazenamento local.
- Versão interna do esquema de dados independente da versão do arquivo de backup, com migração automática e explícita de dados legados sem reescrever refeições, medidas ou hidratação.
- Cópia exata do armazenamento anterior à migração, disponível para download na área **Dados e privacidade**.
- Migração transacional: se a cópia de segurança ou a gravação da nova estrutura falhar, o armazenamento original permanece intacto e o aplicativo entra em modo de proteção.
- Proteção contra versões futuras: uma versão antiga do aplicativo não substitui dados que indiquem ter sido gravados por uma versão mais nova.
- Compatibilidade de importação com backups antigos em JSON sem envelope de versão.
- Ponto de restauração local automático antes de cada importação, com opção de alternar de volta à versão anterior.
- Recuperação de um arquivo local inválido: o conteúdo original é preservado para download antes de o aplicativo iniciar com dados vazios.
- Gravações locais validadas antes de persistir; em caso de erro ou falta de espaço, a alteração em memória é revertida para o último estado salvo e a interface não confirma o registro.
- A tabela TACO fica no arquivo do aplicativo e não ocupa espaço duplicado no armazenamento local; somente alimentos pessoais, produtos e registros do usuário são persistidos.
- Limite de 10 MB por arquivo de backup; se não for possível guardar o ponto de restauração, a importação é cancelada sem substituir os dados atuais.
- Armazenamento no navegador e cache offline após a primeira visita em HTTPS.
- Service worker com precache explícito da interface, manifesto, ícones e catálogo TACO; respostas de rede bem-sucedidas são armazenadas para uso posterior sem internet.
- Navegação offline com fallback para a interface principal; recursos nunca armazenados retornam indisponibilidade explícita em vez de uma página vazia.
- Limpeza de cache limitada a versões antigas do próprio NuTrick, sem apagar caches de outros aplicativos no mesmo domínio.
- Verificação de atualizações ao retornar o app ao primeiro plano, com atualização do script do service worker sem depender do cache HTTP intermediário.
- Avisos de conexão quando o dispositivo fica offline ou volta a ficar online. Consultas a serviços externos continuam dependendo de internet.
- Indicador persistente de ausência de conexão, inclusive quando o NuTrick é aberto já em modo avião; ele desaparece quando a conexão retorna.

## Fontes e limitações dos dados

- O catálogo inicial contém 21 registros associados à **TACO, 4ª edição revisada e ampliada, NEPA/UNICAMP (2011)**. Cada registro conserva o código do alimento e o endereço da fonte. A base ainda é parcial e não cobre todas as marcas, receitas ou métodos de preparo.
- O café aparece em ml por uma aproximação de densidade de 1 g/ml; a TACO apresenta a composição por 100 g. Porções caseiras também podem variar, então pese o alimento quando precisar de mais precisão.
- Produtos pesquisados no **Open Food Facts** vêm de uma base colaborativa. Confira os dados com o rótulo da embalagem; produtos sem calorias, proteínas, carboidratos ou gorduras identificados não podem ser adicionados ao diário.
- Cadastros manuais dependem das informações digitadas pelo usuário.
- A interpretação de texto é local e baseada em regras, **não é uma IA conectada**.
- Leitura de código de barras pela câmera e sincronização em nuvem ainda não foram implementadas. A consulta por digitação do código já está disponível.
- Os dados alimentares ficam neste navegador/dispositivo. O ponto de restauração também fica no mesmo armazenamento local e não substitui uma cópia externa. Exporte backups regularmente e guarde-os fora do aparelho.
- A validação detecta estruturas inválidas e números fora do formato esperado, mas não consegue provar que os valores nutricionais digitados em um backup correspondem ao rótulo original.
- O ponto de restauração local e os dados principais continuam no mesmo armazenamento do navegador. Mantenha backups externos, pois falhas, limpeza do Safari ou perda do aparelho podem apagar ambos.

**Fonte TACO:** [NEPA/UNICAMP, 4ª edição](https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf).

## Executar localmente

Com Python instalado, execute na pasta do projeto:

```bash
python -m http.server 8000
```

Abra http://localhost:8000.

## Estrutura

- `index.html`: interface e lógica da primeira versão.
- `manifest.webmanifest`: metadados PWA.
- `sw.js`: cache offline.
- `icon.svg`: ícone vetorial.
